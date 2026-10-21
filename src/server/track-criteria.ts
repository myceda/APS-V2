import "server-only";
import type { Prisma, TrackCriteria } from "@/generated/prisma/client";
import type { AccountContext } from "@/modules/accounts/types";
import { requireCurriculumAdmin, requireStudent } from "@/modules/accounts/guards";
import { AccessError } from "@/modules/accounts/errors";
import { integer, record, text } from "@/modules/curriculum/validation";
import { completeness, parseCriteria } from "@/modules/track-criteria/validation";
import { emptyCriteriaData, type CriteriaView, type CriteriaData } from "@/modules/track-criteria/types";
import { evaluateEligibility, thaiDate } from "@/modules/track-criteria/evaluate";
import { getDatabase } from "./database";
import { datasetView } from "./academic";
import type { TranscriptPayload } from "@/modules/transcript/types";
const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v));
const conflict = () => new AccessError(409, "CRITERIA_CONFLICT", "ข้อมูลหรือฉบับใช้งานเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนทำต่อ");
function invalid(message: string): never { throw new AccessError(422, "CRITERIA_INVALID", message); }
export function criteriaView(row: TrackCriteria): CriteriaView {
  return { id: row.id, curriculumVersionId: row.curriculumVersionId, catalogueDatasetId: row.catalogueDatasetId, admissionYears: row.admissionYears, track: row.track as CriteriaView["track"], year: row.year, semester: row.semester, version: row.version, editVersion: row.editVersion, status: row.status as CriteriaView["status"], basedOnId: row.basedOnId, data: row.payload as unknown as CriteriaData };
}
async function scope(context: AccountContext, versionId: string, db = getDatabase()) {
  const version = await db.curriculumVersion.findUnique({ where: { id: versionId } });
  if (!version) throw new AccessError(404, "CRITERIA_NOT_FOUND", "ไม่พบหลักสูตร");
  requireCurriculumAdmin(context, version.curriculumId);
}
export async function listCriteria(context: AccountContext) {
  if (context.role !== "admin") throw new AccessError(403, "ADMIN_REQUIRED", "เฉพาะผู้ดูแลหลักสูตร");
  const db = getDatabase();
  const versions = await db.curriculumVersion.findMany({ where: { curriculumId: { in: context.curriculumIds } }, select: { id: true, code: true } });
  const [rows, catalogues] = await Promise.all([
    db.trackCriteria.findMany({ where: { curriculumVersionId: { in: versions.map(v => v.id) } }, orderBy: { createdAt: "desc" } }),
    db.academicDataset.findMany({ where: { curriculumVersionId: { in: versions.map(v => v.id) } }, select: { id: true, version: true, curriculumVersionId: true, status: true, courses: { select: { code: true, name: true } } }, orderBy: { version: "desc" } }),
  ]);
  return { versions, catalogues, items: rows.map(row => ({ ...criteriaView(row), issues: completeness(criteriaView(row)) })) };
}
export async function criteriaHistory(context: AccountContext, id: string) {
  const row = await getDatabase().trackCriteria.findUnique({ where: { id } });
  if (!row) throw new AccessError(404, "CRITERIA_NOT_FOUND", "ไม่พบเกณฑ์");
  await scope(context, row.curriculumVersionId);
  return { criteria: criteriaView(row), events: await getDatabase().trackCriteriaEvent.findMany({ where: { criteriaId: id }, orderBy: { createdAt: "desc" } }) };
}
export async function mutateCriteria(context: AccountContext, value: unknown) {
  const input = record(value), action = text(input.action, 30), db = getDatabase();
  if (context.role !== "admin") throw new AccessError(403, "ADMIN_REQUIRED", "เฉพาะผู้ดูแลหลักสูตร");
  let parsed: ReturnType<typeof parseCriteria> | undefined;
  if (action === "create" || action === "save") {
    try { parsed = parseCriteria(input.criteria); } catch (e) { invalid(e instanceof Error ? e.message : "ข้อมูลไม่ถูกต้อง"); }
    await scope(context, parsed.curriculumVersionId);
  }
  if (!["create", "save", "copy", "publish", "withdraw", "cancel"].includes(action)) invalid("คำสั่งไม่รองรับ");
  const id = action === "create" ? null : text(input.id, 100);
  const prior = id ? await db.trackCriteria.findUnique({ where: { id } }) : null;
  if (id && !prior) throw new AccessError(404, "CRITERIA_NOT_FOUND", "ไม่พบเกณฑ์");
  if (prior) await scope(context, prior.curriculumVersionId);
  const versionId = prior?.curriculumVersionId ?? parsed!.curriculumVersionId;
  if (parsed && parsed.curriculumVersionId !== versionId) invalid("เปลี่ยนหลักสูตรของร่างไม่ได้ ให้สร้างร่างใหม่");
  const reason = text(input.reason, 3000);
  try {
    return await db.$transaction(async tx => {
      // All writes for one curriculum serialize, including empty scopes before a first publication.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${versionId}, 41))::text`;
      const row = id ? await tx.trackCriteria.findUnique({ where: { id } }) : null;
      if (id && (!row || row.editVersion !== integer(input.expectedEditVersion, 1, 1_000_000))) throw conflict();
      const event = async (r: TrackCriteria, eventAction: string) => {
        await tx.trackCriteriaEvent.create({ data: { criteriaId: r.id, actorAccountId: context.accountId, action: eventAction, reason, snapshot: json(criteriaView(r)) } });
      };
      const validateCatalogue = async (v: ReturnType<typeof parseCriteria>, publishing: boolean) => {
        if (!v.catalogueDatasetId) return;
        const cat = await tx.academicDataset.findUnique({ where: { id: v.catalogueDatasetId }, include: { courses: true } });
        if (!cat || cat.curriculumVersionId !== versionId || (publishing && cat.status !== "published")) invalid("ต้องใช้ทะเบียนหลักสูตรที่ตรงกันและเผยแพร่แล้วก่อนเผยแพร่เกณฑ์");
        for (const code of [...v.data.targetCourseCodes, ...v.data.courses.codes]) if (!cat.courses.some(c => c.code === code)) invalid(`ไม่พบรหัส ${code} ในทะเบียนที่เลือก`);
      };
      if (action === "create" || action === "copy") {
        const data = parsed ?? { curriculumVersionId: versionId, catalogueDatasetId: row!.catalogueDatasetId, admissionYears: row!.admissionYears, track: row!.track as CriteriaView["track"], year: row!.year, semester: row!.semester, data: row!.payload as unknown as CriteriaData };
        await validateCatalogue(data, false);
        const max = await tx.trackCriteria.aggregate({ where: { curriculumVersionId: versionId }, _max: { version: true } });
        const created = await tx.trackCriteria.create({ data: { curriculumVersionId: versionId, catalogueDatasetId: data.catalogueDatasetId, admissionYears: data.admissionYears, track: data.track, year: data.year, semester: data.semester, version: (max._max.version ?? 0) + 1, payload: json(data.data), basedOnId: row?.id ?? null } });
        await event(created, action); return criteriaView(created);
      }
      if (!row) throw conflict();
      if (action === "save") {
        if (row.status !== "draft") throw conflict();
        const v = parsed!;
        await validateCatalogue(v, false);
        if (row.year !== v.year || row.semester !== v.semester || row.track !== v.track || [...row.admissionYears].sort().join() !== [...v.admissionYears].sort().join()) {
          const fresh = emptyCriteriaData();
          for (const key of ["gpax", "courses", "exceptions", "manual"] as const) Object.assign(v.data[key], fresh[key]);
        }
        const saved = await tx.trackCriteria.update({ where: { id: row.id }, data: { catalogueDatasetId: v.catalogueDatasetId, admissionYears: v.admissionYears, track: v.track, year: v.year, semester: v.semester, payload: json(v.data), editVersion: { increment: 1 } } });
        await event(saved, action); return criteriaView(saved);
      }
      if (action === "publish") {
        if (row.status !== "draft") throw conflict();
        const v = parseCriteria(criteriaView(row)), missing = completeness(v);
        if (missing.length) invalid(missing.join("; "));
        await validateCatalogue(v, true);
        const active = await tx.trackCriteria.findMany({ where: { curriculumVersionId: versionId, track: row.track, year: row.year, semester: row.semester, status: "published", admissionYears: { hasSome: row.admissionYears } } });
        const overlap = active.filter(r => { const d = r.payload as unknown as CriteriaData; return d.effectiveFrom <= v.data.effectiveUntil && d.effectiveUntil >= v.data.effectiveFrom; });
        if (input.replacesId) {
          const old = overlap.find(r => r.id === input.replacesId);
          if (!old || overlap.length !== 1 || old.editVersion !== input.expectedReplacedEditVersion || [...old.admissionYears].sort().join() !== [...row.admissionYears].sort().join()) throw conflict();
          const oldData = old.payload as unknown as CriteriaData;
          if (oldData.effectiveFrom !== v.data.effectiveFrom || oldData.effectiveUntil !== v.data.effectiveUntil) invalid("การแทนฉบับต้องตรงขอบเขตและช่วงวันทั้งหมด");
          const withdrawn = await tx.trackCriteria.update({ where: { id: old.id }, data: { status: "withdrawn", editVersion: { increment: 1 } } });
          await event(withdrawn, `replaced_by:${row.id}`);
        } else if (overlap.length) throw conflict();
        const published = await tx.trackCriteria.update({ where: { id: row.id }, data: { status: "published", editVersion: { increment: 1 } } });
        await event(published, input.replacesId ? `publish_replacing:${input.replacesId}` : action); return criteriaView(published);
      }
      if (row.status !== (action === "cancel" ? "draft" : "published")) throw conflict();
      const withdrawn = await tx.trackCriteria.update({ where: { id: row.id }, data: { status: "withdrawn", editVersion: { increment: 1 } } });
      await event(withdrawn, action); return criteriaView(withdrawn);
    }, { timeout: 15_000 });
  } catch (e) {
    if ((e as { code?: string }).code === "P2034") throw conflict();
    throw e;
  }
}

export async function cohortRecord(context: AccountContext, versionId: string, studentCode: string) {
  await scope(context, versionId);
  const row = await getDatabase().studentEnrollment.findFirst({ where: { curriculumVersionId: versionId, studentCode } });
  if (!row) throw new AccessError(404, "ENROLLMENT_NOT_FOUND", "ไม่พบข้อมูลนักศึกษาในหลักสูตรนี้");
  return { id: row.id, studentCode: row.studentCode, admissionYear: row.admissionYear, source: row.cohortSource, version: row.cohortVersion };
}
export async function confirmCohort(context: AccountContext, value: unknown) {
  const v = record(value), versionId = text(v.curriculumVersionId, 100), studentCode = text(v.studentCode, 30);
  const row = await cohortRecord(context, versionId, studentCode);
  const year = integer(v.admissionYear, 2500, 2700), source = text(v.source, 3000), expected = integer(v.expectedVersion, 1, 1_000_000);
  return getDatabase().$transaction(async tx => {
    const changed = await tx.studentEnrollment.updateMany({ where: { id: row.id, cohortVersion: expected }, data: { admissionYear: year, cohortSource: source, cohortVersion: { increment: 1 } } });
    if (!changed.count) throw conflict();
    const owner = await tx.studentEnrollment.findUniqueOrThrow({ where: { id: row.id } });
    await tx.auditEvent.create({ data: { actorAccountId: context.accountId, targetAccountId: owner.accountAccessId, action: `cohort_confirmed:${year}`, changedFields: ["admissionYear", "cohortSource"] } });
    return { ...row, admissionYear: year, source, version: expected + 1 };
  });
}
export async function studentCriteria(context: AccountContext, term: { year: number; semester: number }) {
  const enrollment = requireStudent(context), db = getDatabase();
  const owned = await db.studentEnrollment.findFirst({ where: { id: enrollment.id, accountAccessId: context.accountId } });
  if (!owned) throw new AccessError(404, "ENROLLMENT_NOT_FOUND", "ไม่พบข้อมูลนักศึกษา");
  const [state, cat, rows] = await Promise.all([
    db.studentAcademicState.findUnique({ where: { enrollmentId: owned.id }, include: { currentRevision: true } }),
    db.academicDataset.findFirst({ where: { curriculumVersionId: owned.curriculumVersionId, status: "published" }, include: { courses: true, offerings: true }, orderBy: { version: "desc" } }),
    db.trackCriteria.findMany({ where: { curriculumVersionId: owned.curriculumVersionId, year: term.year, semester: term.semester, status: "published", ...(owned.admissionYear === null ? { id: { in: [] } } : { admissionYears: { has: owned.admissionYear } }) } }),
  ]);
  const today = thaiDate();
  const pinnedCatalogues = await db.academicDataset.findMany({ where: { id: { in: rows.flatMap(r => r.catalogueDatasetId ? [r.catalogueDatasetId] : []) }, status: "published", curriculumVersionId: owned.curriculumVersionId }, include: { courses: true, offerings: true } });
  const results = (["project", "cooperative"] as const).map(track => {
    const active = rows.filter(r => r.track === track && (r.payload as unknown as CriteriaData).effectiveFrom <= today && (r.payload as unknown as CriteriaData).effectiveUntil >= today);
    if (owned.admissionYear === null || !active.length) return { track, status: "awaiting_criteria" as const, reasons: [owned.admissionYear === null ? "รอผู้ดูแลยืนยันปีที่เข้าศึกษา ไม่เดาจากรหัสนักศึกษา" : "ยังไม่มีเกณฑ์เผยแพร่ที่อยู่ในช่วงใช้ตรงรุ่นและรอบ ไม่ใช้เกณฑ์เก่าแทน"], criteriaId: null, criteriaVersion: null, approval: "not_verified" as const };
    const pinned = pinnedCatalogues.find(c => c.id === active[0]?.catalogueDatasetId);
    if (!cat || !pinned || !state?.currentRevision || state.currentRevision.ownerAccountId !== context.accountId) return { track, status: "insufficient_data" as const, reasons: ["ต้องมีผลการเรียนที่ยืนยันและทะเบียนหลักสูตรเผยแพร่เพื่อประเมิน ไม่สร้างผลอนุมัติเอง"], criteriaId: null, criteriaVersion: null, approval: "not_verified" as const };
    return evaluateEligibility({ track, curriculumVersionId: owned.curriculumVersionId, admissionYear: owned.admissionYear, term, today, criteria: rows.map(criteriaView), dataset: datasetView(pinned), transcript: state.currentRevision.payload as unknown as TranscriptPayload });
  });
  return { admissionYear: owned.admissionYear, term, evaluatedAt: new Date().toISOString(), results };
}
