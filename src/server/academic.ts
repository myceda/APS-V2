import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { AccountContext } from "@/modules/accounts/types";
import {
  requireCurriculumAdmin,
  requireStudent,
  requireStudentAccount,
} from "@/modules/accounts/guards";
import { AccessError } from "@/modules/accounts/errors";
import type { Dataset, StudyTrack } from "@/modules/curriculum/types";
import {
  integer,
  parseCourse,
  parseGroups,
  parseOffering,
  parsePolicy,
  record,
  text,
  validateDataset,
} from "@/modules/curriculum/validation";
import seed from "@/modules/curriculum/data/cs2565.json";
import type { DraftView, TranscriptPayload } from "@/modules/transcript/types";
import {
  parsePayload,
  transcriptIssues,
} from "@/modules/transcript/validation";
import { auditTranscript, ENGINE_VERSION } from "@/modules/analysis/engine";
import {
  makePlan,
  validateParameters,
  type PlanningParameters,
} from "@/modules/planning/engine";
import {
  simulate,
  type ScenarioEvent,
  type OfferingAssumption,
} from "@/modules/simulation/engine";
import { getDatabase } from "./database";
import { extractPdf } from "./pdf-extraction";

const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value));
const conflict = () =>
  new AccessError(
    409,
    "ACADEMIC_CONFLICT",
    "ข้อมูลเปลี่ยนจากอีกหน้าต่าง กรุณาโหลดใหม่และตรวจทานก่อนทำต่อ",
  );
const notFound = () =>
  new AccessError(
    404,
    "ACADEMIC_NOT_FOUND",
    "ไม่พบข้อมูลที่คุณมีสิทธิ์เข้าถึง",
  );
function validation(error: unknown): never {
  if (error instanceof AccessError) throw error;
  throw new AccessError(
    422,
    "ACADEMIC_INVALID",
    error instanceof Error ? error.message : "ข้อมูลไม่ถูกต้อง",
  );
}
async function transaction<T>(
  work: (db: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await getDatabase().$transaction(work, {
        isolationLevel: "Serializable",
        timeout: 15_000,
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2034" && attempt < 2)
        continue;
      if (
        (error as { code?: string }).code === "P2034" ||
        (error as { code?: string }).code === "P2002"
      )
        throw conflict();
      throw error;
    }
  }
  throw conflict();
}
type DatasetRow = Prisma.AcademicDatasetGetPayload<{
  include: { courses: true; offerings: true };
}>;
export function datasetView(row: DatasetRow): Dataset {
  return {
    id: row.id,
    curriculumVersionId: row.curriculumVersionId,
    version: row.version,
    editVersion: row.editVersion,
    status: row.status as Dataset["status"],
    source: row.source,
    courses: row.courses.map((c) => ({
      code: c.code,
      name: c.name,
      credits: c.credits,
      category: c.category as Dataset["courses"][number]["category"],
      tracks: c.tracks as StudyTrack[],
      grading: c.grading as Dataset["courses"][number]["grading"],
      specific: c.specific,
      prerequisite:
        c.prerequisite as unknown as Dataset["courses"][number]["prerequisite"],
      requiresConsent: c.requiresConsent,
      source: c.source,
    })),
    offerings: row.offerings.map((o) => ({
      courseCode: o.courseCode,
      year: o.year,
      semester: o.semester as 1 | 2 | 3,
      availability:
        o.availability as Dataset["offerings"][number]["availability"],
      confidence: o.confidence as Dataset["offerings"][number]["confidence"],
      source: o.source,
    })),
    policy: row.policy as unknown as Dataset["policy"],
    groups: row.groups as unknown as Dataset["groups"],
    unresolved: row.unresolved as unknown as string[],
  };
}
type DraftRow = Prisma.TranscriptDraftGetPayload<{
  include: { attempts: true };
}>;
function draftView(row: DraftRow): DraftView {
  return {
    id: row.id,
    documentId: row.documentId,
    baseRevisionId: row.baseRevisionId,
    editVersion: row.editVersion,
    status: row.status,
    pages: row.pages,
    header: row.header as unknown as DraftView["header"],
    summaries: row.summaries as unknown as DraftView["summaries"],
    issues: row.issues as unknown as DraftView["issues"],
    attempts: row.attempts.map((a) => ({
      ordinal: a.ordinal,
      courseCode: a.courseCode,
      name: a.name,
      credits: a.credits,
      grade: a.grade,
      gradePoints: a.gradePoints,
      year: a.year,
      semester: a.semester,
      kind: a.kind as DraftView["attempts"][number]["kind"],
      sourcePage: a.sourcePage,
    })),
  };
}
export async function getDraft(
  context: AccountContext,
  id: string,
): Promise<DraftView> {
  requireStudentAccount(context);
  const row = await getDatabase().transcriptDraft.findFirst({
    where: {
      id,
      ownerAccountId: context.accountId,
    },
    include: { attempts: { orderBy: { ordinal: "asc" } } },
  });
  if (!row) throw notFound();
  return draftView(row);
}
export async function uploadTranscript(
  context: AccountContext,
  content: Uint8Array,
): Promise<DraftView> {
  requireStudentAccount(context);
  const enrollment = context.enrollment;
  const payload = await extractPdf(content);
  const issues = transcriptIssues(payload, enrollment);
  const id = await transaction(async (db) => {
    const state = enrollment ? await db.studentAcademicState.upsert({
      where: { enrollmentId: enrollment.id },
      create: { enrollmentId: enrollment.id },
      update: {},
    }) : null;
    const document = await db.privateDocument.create({
      data: {
        ownerAccountId: context.accountId,
        content: new Uint8Array(content),
        sha256: createHash("sha256").update(content).digest("hex"),
      },
    });
    const draft = await db.transcriptDraft.create({
      data: {
        ownerAccountId: context.accountId,
        enrollmentId: enrollment?.id ?? null,
        documentId: document.id,
        baseRevisionId: state?.currentRevisionId ?? null,
        header: json(payload.header),
        extracted: json(payload),
        pages: payload.pages,
        summaries: json(payload.summaries),
        issues: json(issues),
        attempts: { create: payload.attempts },
      },
    });
    return draft.id;
  });
  return getDraft(context, id);
}
export async function saveDraft(
  context: AccountContext,
  id: string,
  value: unknown,
) {
  requireStudentAccount(context);
  const enrollment = context.enrollment;
  const existing = await getDraft(context, id);
  if (existing.status !== "draft")
    throw new AccessError(
      409,
      "DRAFT_CLOSED",
      "ร่างนี้ยืนยันหรือยกเลิกแล้ว กรุณาสร้างร่างใหม่",
    );
  let expectedVersion: number, payload: TranscriptPayload;
  try {
    const input = record(value);
    expectedVersion = integer(input.expectedVersion, 1, 1_000_000);
    payload = parsePayload(input.payload, existing);
  } catch (error) {
    validation(error);
  }
  const issues = transcriptIssues(payload, enrollment);
  await transaction(async (db) => {
    const updated = await db.transcriptDraft.updateMany({
      where: {
        id,
        ownerAccountId: context.accountId,
        status: "draft",
        editVersion: expectedVersion,
      },
      data: {
        header: json(payload.header),
        issues: json(issues),
        editVersion: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw conflict();
    for (const row of payload.attempts)
      await db.draftCourseAttempt.update({
        where: { draftId_ordinal: { draftId: id, ordinal: row.ordinal } },
        data: row,
      });
  });
  return getDraft(context, id);
}
export async function cancelDraft(
  context: AccountContext,
  id: string,
  expectedVersion: number,
) {
  requireStudentAccount(context);
  const changed = await getDatabase().transcriptDraft.updateMany({
    where: {
      id,
      ownerAccountId: context.accountId,
      status: "draft",
      editVersion: expectedVersion,
    },
    data: { status: "cancelled", editVersion: { increment: 1 } },
  });
  if (changed.count !== 1) throw conflict();
  return { cancelled: true };
}
export async function confirmDraft(
  context: AccountContext,
  id: string,
  expectedVersion: number,
) {
  requireStudentAccount(context);
  const result = await transaction(async (db) => {
    // Serialize first confirmations for an account, even with two open drafts.
    await db.$queryRaw`SELECT id FROM "AccountAccess" WHERE id = ${context.accountId}::uuid FOR UPDATE`;
    const account = await db.accountAccess.findUnique({
      where: { id: context.accountId },
    });
    if (!account || account.status !== "active" || account.role !== "student" || account.authUserId !== context.authUserId)
      throw new AccessError(403, "ACCOUNT_INACTIVE", "บัญชีนี้ไม่มีสิทธิ์ยืนยันข้อมูล กรุณาเข้าสู่ระบบใหม่");
    const row = await db.transcriptDraft.findFirst({
      where: { id, ownerAccountId: context.accountId },
      include: { attempts: { orderBy: { ordinal: "asc" } }, revision: true },
    });
    if (!row) throw notFound();
    if (row.revision) return { revisionId: row.revision.id, alreadyConfirmed: true };
    if (row.status !== "draft" || row.editVersion !== expectedVersion) throw conflict();
    const payload = draftView(row);
    const issues = transcriptIssues(payload, context.enrollment);
    if (issues.some((i) => i.severity === "blocking"))
      throw new AccessError(422, "TRANSCRIPT_REVIEW_REQUIRED", "ยังมีข้อมูลที่ต้องตรวจ กรุณาแก้รายการที่แจ้งก่อนยืนยัน");
    let enrollment = await db.studentEnrollment.findUnique({
      where: { accountAccessId: context.accountId },
    });
    if (!enrollment) {
      // Only the supported curriculum is offered; the PDF cannot grant roles.
      const versions = await db.curriculumVersion.findMany({
        where: { curriculum: { code: "CS2565" } },
        include: { tracks: true },
        orderBy: { code: "asc" },
      });
      const published = await db.academicDataset.findFirst({
        where: {
          status: "published",
          curriculumVersion: { curriculum: { code: "CS2565" } },
        },
        orderBy: { publishedAt: "desc" },
      });
      const version = published
        ? versions.find((v) => v.id === published.curriculumVersionId)
        : versions.length === 1 ? versions[0] : null;
      if (!version) throw new AccessError(422,"CURRICULUM_NOT_READY","ยังเลือกหลักสูตรสำหรับวิเคราะห์ไม่ได้ ผู้ดูแลต้องเตรียมข้อมูล CS2565 ก่อน");
      const selectedTrack = version.tracks.find((t) => t.code === payload.header.track);
      if (payload.header.trackState === "selected" && !selectedTrack) throw new AccessError(422,"CURRICULUM_NOT_READY","ผู้ดูแลต้องเตรียมข้อมูลสายการศึกษาที่ระบุในเอกสารก่อน");
      const studentCode = payload.header.studentCode.value!;
      const duplicate = await db.studentEnrollment.findUnique({
        where: { curriculumVersionId_studentCode: { curriculumVersionId: version.id, studentCode } },
      });
      if (duplicate) return {
        duplicate: true as const,
        versionId: version.id, studentCode,
        trackId: selectedTrack?.id ?? null,
        trackState: payload.header.trackState,
      };
      enrollment = await db.studentEnrollment.create({
        data: {
          accountAccessId: context.accountId, studentCode,
          curriculumVersionId: version.id,
          trackState: payload.header.trackState,
          trackId: selectedTrack?.id ?? null,
          confirmationSource: "student_confirmed",
        },
      });
      await db.auditEvent.create({ data: {
        actorAccountId: context.accountId, targetAccountId: context.accountId,
        action: "self_confirm_academic_profile", changedFields: ["enrollment"],
      } });
    } else if (payload.header.studentCode.value !== enrollment.studentCode || (row.enrollmentId && row.enrollmentId!==enrollment.id)) {
      throw new AccessError(409,"STUDENT_PROFILE_CONFLICT","ข้อมูลนักศึกษาไม่ตรงกับข้อมูลเดิม กรุณาตรวจเอกสารหรือติดต่อผู้ดูแล");
    }
    const state = await db.studentAcademicState.upsert({
      where: { enrollmentId: enrollment.id },
      create: { enrollmentId: enrollment.id }, update: {},
    });
    if (state.currentRevisionId !== row.baseRevisionId) throw conflict();
    const revision = await db.transcriptRevision.create({ data: {
      ownerAccountId: context.accountId, enrollmentId: enrollment.id, draftId: id,
      payload: json({
        header: payload.header, attempts: payload.attempts,
        summaries: payload.summaries, pages: payload.pages,
      }),
    } });
    const changed = await db.studentAcademicState.updateMany({
      where: { enrollmentId: enrollment.id, currentRevisionId: row.baseRevisionId },
      data: { currentRevisionId: revision.id },
    });
    if (changed.count !== 1) throw conflict();
    await db.transcriptDraft.update({
      where: { id },
      data: { enrollmentId: enrollment.id, status: "confirmed", editVersion: { increment: 1 } },
    });
    return { revisionId: revision.id, alreadyConfirmed: false };
  });
  if (result.duplicate) {
    // Keep the review request outside the rolled-back academic operation.
    await transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "AccountAccess" WHERE id = ${context.accountId}::uuid FOR UPDATE`;
      const existing = await db.enrollmentRequest.findFirst({ where: {
        accountAccessId: context.accountId, status: "pending",
        studentCode: result.studentCode, curriculumVersionId: result.versionId,
      } });
      if (!existing) await db.enrollmentRequest.create({ data: {
        accountAccessId: context.accountId, studentCode: result.studentCode,
        curriculumVersionId: result.versionId, trackState: result.trackState,
        trackId: result.trackId,
        submissionReason: "รหัสนักศึกษาซ้ำกับข้อมูลที่มีอยู่ กรุณาตรวจสอบเจ้าของเอกสาร",
      } });
    });
    throw new AccessError(409,"ENROLLMENT_CONFLICT","รหัสนักศึกษานี้มีข้อมูลอยู่แล้ว ส่งเรื่องให้ผู้ดูแลตรวจแล้ว ร่างของคุณยังอยู่และยังไม่เปลี่ยนข้อมูลจริง");
  }
  return result;
}

export async function reviseTranscript(context: AccountContext) {
  const enrollment = requireStudent(context);
  const state = await getDatabase().studentAcademicState.findUnique({
    where: { enrollmentId: enrollment.id },
    include: { currentRevision: { include: { draft: true } } },
  });
  const revision = state?.currentRevision;
  if (!revision || revision.ownerAccountId !== context.accountId)
    throw notFound();
  const payload = revision.payload as unknown as TranscriptPayload;
  const row = await getDatabase().transcriptDraft.create({
    data: {
      ownerAccountId: context.accountId,
      enrollmentId: enrollment.id,
      documentId: revision.draft.documentId,
      baseRevisionId: revision.id,
      header: json(payload.header),
      extracted: revision.draft.extracted as Prisma.InputJsonValue,
      pages: payload.pages,
      summaries: json(payload.summaries),
      issues: json(transcriptIssues(payload, enrollment)),
      attempts: { create: payload.attempts },
    },
  });
  return getDraft(context, row.id);
}
export async function ownDocument(context: AccountContext, id: string) {
  requireStudentAccount(context);
  const document = await getDatabase().privateDocument.findFirst({
    where: { id, ownerAccountId: context.accountId },
  });
  if (!document) throw notFound();
  return document;
}
export async function listDatasets(context: AccountContext) {
  if (context.role !== "admin")
    throw new AccessError(403, "ADMIN_REQUIRED", "เฉพาะผู้ดูแลหลักสูตร");
  const versions = await getDatabase().curriculumVersion.findMany({
    where: { curriculumId: { in: context.curriculumIds } },
    include: { curriculum: true },
  });
  const rows = await getDatabase().academicDataset.findMany({
    where: { curriculumVersionId: { in: versions.map((v) => v.id) } },
    include: { courses: { orderBy: { code: "asc" } }, offerings: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return {
    versions: versions.map((v) => ({
      id: v.id,
      code: v.code,
      curriculumCode: v.curriculum.code,
      name: v.curriculum.name,
    })),
    datasets: rows.map(datasetView),
  };
}
async function datasetForAdmin(context: AccountContext, id: string) {
  const row = await getDatabase().academicDataset.findUnique({
    where: { id },
    include: { curriculumVersion: true, courses: true, offerings: true },
  });
  if (!row) throw notFound();
  requireCurriculumAdmin(context, row.curriculumVersion.curriculumId);
  return row;
}
export async function createDataset(
  context: AccountContext,
  versionId: string,
  copyId?: string,
) {
  const version = await getDatabase().curriculumVersion.findUnique({
    where: { id: versionId },
    include: { curriculum: true },
  });
  if (!version) throw notFound();
  requireCurriculumAdmin(context, version.curriculumId);
  const copy = copyId
    ? datasetView(await datasetForAdmin(context, copyId))
    : null;
  if (copy && copy.curriculumVersionId !== versionId)
    throw new AccessError(
      422,
      "DATASET_SCOPE_MISMATCH",
      "สำเนาต้องอยู่ในฉบับหลักสูตรเดียวกัน",
    );
  if (!copy && version.curriculum.code !== "CS2565")
    throw new AccessError(
      422,
      "SEED_UNAVAILABLE",
      "ยังไม่มีชุดเริ่มต้นสำหรับหลักสูตรนี้",
    );
  const source = copy ?? seed;
  const courses = source.courses.map(parseCourse),
    policy = parsePolicy(source.policy),
    groups = parseGroups(source.groups),
    offerings = source.offerings.map(parseOffering);
  const row = await transaction(async (db) => {
    const maximum = await db.academicDataset.aggregate({
      where: { curriculumVersionId: versionId },
      _max: { version: true },
    });
    return db.academicDataset.create({
      data: {
        curriculumVersionId: versionId,
        version: (maximum._max.version ?? 0) + 1,
        source: source.source,
        policy: json(policy),
        groups: json(groups),
        unresolved: json(source.unresolved),
        courses: {
          create: courses.map((c) => ({
            ...c,
            prerequisite: json(c.prerequisite),
          })),
        },
        offerings: { create: offerings },
      },
      include: { courses: true, offerings: true },
    });
  });
  return datasetView(row);
}
export async function saveDataset(
  context: AccountContext,
  id: string,
  value: unknown,
) {
  const existing = datasetView(await datasetForAdmin(context, id));
  if (existing.status !== "draft")
    throw new AccessError(
      409,
      "DATASET_IMMUTABLE",
      "ฉบับเผยแพร่แก้ไม่ได้ กรุณาสร้างสำเนาร่างใหม่",
    );
  let dataset: Dataset, expectedVersion: number;
  try {
    const input = record(value);
    expectedVersion = integer(input.expectedVersion, 1, 1_000_000);
    const raw = record(input.dataset);
    if (
      !Array.isArray(raw.courses) ||
      raw.courses.length > 2000 ||
      !Array.isArray(raw.offerings) ||
      raw.offerings.length > 15000 ||
      !Array.isArray(raw.unresolved)
    )
      throw new Error("จำนวนรายการไม่ถูกต้อง");
    dataset = {
      ...existing,
      source: text(raw.source, 1000),
      courses: raw.courses.map(parseCourse),
      offerings: raw.offerings.map(parseOffering),
      groups: parseGroups(raw.groups),
      policy: parsePolicy(raw.policy),
      unresolved: raw.unresolved.map((v) => text(v, 1000)),
    };
    const errors = validateDataset(dataset);
    if (errors.length) throw new Error(errors.slice(0, 12).join("; "));
  } catch (error) {
    validation(error);
  }
  await transaction(async (db) => {
    const changed = await db.academicDataset.updateMany({
      where: { id, status: "draft", editVersion: expectedVersion },
      data: {
        source: dataset.source,
        policy: json(dataset.policy),
        groups: json(dataset.groups),
        unresolved: json(dataset.unresolved),
        editVersion: { increment: 1 },
      },
    });
    if (changed.count !== 1) throw conflict();
    await db.catalogCourse.deleteMany({ where: { datasetId: id } });
    await db.courseOffering.deleteMany({ where: { datasetId: id } });
    await db.catalogCourse.createMany({
      data: dataset.courses.map((c) => ({
        ...c,
        datasetId: id,
        prerequisite: json(c.prerequisite),
      })),
    });
    await db.courseOffering.createMany({
      data: dataset.offerings.map((o) => ({ ...o, datasetId: id })),
    });
  });
  return datasetView(await datasetForAdmin(context, id));
}
export async function publishDataset(
  context: AccountContext,
  id: string,
  expectedVersion: number,
) {
  const dataset = datasetView(await datasetForAdmin(context, id)),
    errors = validateDataset(dataset);
  if (dataset.status !== "draft" || dataset.editVersion !== expectedVersion)
    throw conflict();
  if (errors.length)
    throw new AccessError(
      422,
      "DATASET_NOT_READY",
      errors.slice(0, 8).join("; "),
    );
  const changed = await getDatabase().academicDataset.updateMany({
    where: { id, status: "draft", editVersion: dataset.editVersion },
    data: {
      status: "published",
      publishedAt: new Date(),
      editVersion: { increment: 1 },
    },
  });
  if (changed.count !== 1) throw conflict();
  return {
    published: true,
    limitations: dataset.unresolved,
    capabilities: {
      diagnosticGpa: true,
      confirmedGpa:
        dataset.policy.repeat !== "unconfirmed" &&
        dataset.policy.rounding !== "unconfirmed" &&
        dataset.policy.gpaComparison === "raw" &&
        dataset.policy.specificGpaBasis === "all_specific",
      fullAcademicConclusion: false,
    },
  };
}
export interface AcademicResult {
  engineVersion: string;
  revisionId: string;
  datasetId: string;
  datasetVersion: number;
  parameters: PlanningParameters;
  trackState: string;
  audits: ReturnType<typeof auditTranscript>[];
  plans: ReturnType<typeof makePlan>[];
  catalogue: Dataset["courses"];
}
export async function runAnalysis(context: AccountContext, value: unknown) {
  const enrollment = requireStudent(context),
    database = getDatabase();
  const state = await database.studentAcademicState.findUnique({
    where: { enrollmentId: enrollment.id },
    include: { currentRevision: true },
  });
  if (
    !state?.currentRevision ||
    state.currentRevision.ownerAccountId !== context.accountId
  )
    throw new AccessError(
      422,
      "CONFIRMED_TRANSCRIPT_REQUIRED",
      "กรุณายืนยันผลการเรียนก่อนวิเคราะห์",
    );
  const datasetRow = await database.academicDataset.findFirst({
    where: {
      curriculumVersionId: enrollment.curriculumVersionId,
      status: "published",
    },
    include: { courses: true, offerings: true },
    orderBy: { version: "desc" },
  });
  if (!datasetRow)
    throw new AccessError(
      422,
      "PUBLISHED_DATASET_REQUIRED",
      "ผู้ดูแลต้องตรวจและเผยแพร่ข้อมูลหลักสูตรก่อนวิเคราะห์",
    );
  const dataset = datasetView(datasetRow);
  let parameters: PlanningParameters;
  try {
    parameters = validateParameters(value, dataset);
  } catch (error) {
    validation(error);
  }
  const payload = state.currentRevision.payload as unknown as TranscriptPayload;
  const trackRow = enrollment.trackId
    ? await database.track.findUnique({ where: { id: enrollment.trackId } })
    : null;
  const track = trackRow?.code;
  if (enrollment.trackState === "unknown")
    throw new AccessError(
      422,
      "ENROLLMENT_TRACK_UNKNOWN",
      "กรุณาให้ผู้ดูแลยืนยันว่าเลือกสายหรือยังไม่เลือกสายก่อนสร้างแผน",
    );
  if (
    enrollment.trackState === "selected" &&
    track !== "project" &&
    track !== "cooperative"
  )
    throw new AccessError(
      422,
      "TRACK_UNSUPPORTED",
      "ยังไม่รองรับสายที่ผูกบัญชี",
    );
  if (
    enrollment.trackState === "selected" &&
    payload.header.track &&
    payload.header.track !== track
  )
    throw new AccessError(
      422,
      "TRANSCRIPT_TRACK_CONFLICT",
      "สายที่ PDF รายงานขัดแย้งกับบริบทบัญชี กรุณาตรวจทานกับผู้ดูแล",
    );
  const tracks: StudyTrack[] =
    enrollment.trackState === "not_selected"
      ? ["project", "cooperative"]
      : [track as StudyTrack];
  const result: AcademicResult = {
    engineVersion: ENGINE_VERSION,
    revisionId: state.currentRevision.id,
    datasetId: dataset.id,
    datasetVersion: dataset.version,
    parameters,
    trackState: enrollment.trackState,
    catalogue: dataset.courses,
    audits: tracks.map((t) => auditTranscript(payload, dataset, t)),
    plans: tracks.map((t) =>
      makePlan(
        payload,
        dataset,
        t,
        parameters,
        enrollment.trackState === "not_selected" ? "alternative" : "actual",
      ),
    ),
  };
  const row = await database.analysisRun.create({
    data: {
      ownerAccountId: context.accountId,
      revisionId: state.currentRevision.id,
      datasetId: dataset.id,
      engineVersion: ENGINE_VERSION,
      parameters: json(parameters),
      result: json(result),
    },
  });
  return { id: row.id, result };
}
export async function runScenario(context: AccountContext, value: unknown) {
  requireStudent(context);
  let input: Record<string, unknown>;
  try {
    input = record(value);
  } catch (error) {
    validation(error);
  }
  const analysis = await getDatabase().analysisRun.findFirst({
    where: { id: String(input.analysisId), ownerAccountId: context.accountId },
    include: {
      revision: true,
      dataset: { include: { courses: true, offerings: true } },
    },
  });
  if (!analysis) throw notFound();
  if (analysis.engineVersion !== ENGINE_VERSION)
    throw new AccessError(
      409,
      "ENGINE_UPDATED",
      "กลไกคำนวณเปลี่ยนฉบับแล้ว กรุณาคำนวณผลฐานใหม่ก่อนจำลอง",
    );
  const basis = analysis.result as unknown as AcademicResult,
    dataset = datasetView(analysis.dataset),
    track = input.track as StudyTrack;
  if (
    !basis.plans.some((p) => p.track === track) ||
    !Array.isArray(input.events)
  )
    throw new AccessError(
      422,
      "SCENARIO_INVALID",
      "สายหรือเหตุการณ์ไม่ตรงกับผลฐาน",
    );
  let comparison: ReturnType<typeof simulate>;
  try {
    comparison = simulate(
      analysis.revision.payload as unknown as TranscriptPayload,
      dataset,
      track,
      basis.parameters,
      input.events as ScenarioEvent[],
      (input.offeringAssumptions ?? []) as OfferingAssumption[],
    );
  } catch (error) {
    validation(error);
  }
  const row = await getDatabase().simulationScenario.create({
    data: {
      ownerAccountId: context.accountId,
      analysisId: analysis.id,
      events: json({
        events: input.events,
        offeringAssumptions: input.offeringAssumptions ?? [],
      }),
      comparison: json(comparison),
    },
  });
  return {
    id: row.id,
    analysisId: analysis.id,
    revisionId: analysis.revisionId,
    datasetId: dataset.id,
    comparison,
  };
}
export async function studentWorkspace(context: AccountContext) {
  requireStudentAccount(context);
  const enrollment = context.enrollment;
  const database = getDatabase();
  if (!enrollment) {
    const drafts = await database.transcriptDraft.findMany({
      where: { ownerAccountId: context.accountId, status: "draft" },
      include: { attempts: { orderBy: { ordinal: "asc" } } },
      orderBy: { createdAt: "desc" }, take: 5,
    });
    return { enrollment: null, drafts: drafts.map(draftView), revision: null, dataset: null, analysis: null };
  }
  const [drafts, state, dataset, analysis] = await Promise.all([
    database.transcriptDraft.findMany({
      where: {
        ownerAccountId: context.accountId,
        enrollmentId: enrollment.id,
        status: "draft",
      },
      include: { attempts: { orderBy: { ordinal: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    database.studentAcademicState.findUnique({
      where: { enrollmentId: enrollment.id },
      include: { currentRevision: true },
    }),
    database.academicDataset.findFirst({
      where: {
        curriculumVersionId: enrollment.curriculumVersionId,
        status: "published",
      },
      select: { id: true, version: true },
      orderBy: { version: "desc" },
    }),
    database.analysisRun.findFirst({
      where: {
        ownerAccountId: context.accountId,
        revision: { enrollmentId: enrollment.id },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    enrollment,
    drafts: drafts.map(draftView),
    revision: state?.currentRevision
      ? {
          id: state.currentRevision.id,
          confirmedAt: state.currentRevision.confirmedAt.toISOString(),
          payload: state.currentRevision
            .payload as unknown as TranscriptPayload,
        }
      : null,
    dataset,
    analysis: analysis
      ? {
          id: analysis.id,
          result: analysis.result as unknown as AcademicResult,
          stale:
            analysis.engineVersion !== ENGINE_VERSION ||
            analysis.revisionId !== state?.currentRevisionId ||
            analysis.datasetId !== dataset?.id,
        }
      : null,
  };
}
