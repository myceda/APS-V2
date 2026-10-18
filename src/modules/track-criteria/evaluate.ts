import type { Dataset, StudyTrack } from "@/modules/curriculum/types";
import type { TranscriptPayload } from "@/modules/transcript/types";
import { auditTranscript, calculateGpa, chronological } from "@/modules/analysis/engine";
import { completeness } from "./validation";
import type { CriteriaView, EligibilityResult } from "./types";
export function thaiDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function evaluateEligibility(args: {
  track: StudyTrack; curriculumVersionId: string; admissionYear: number | null;
  term: { year: number; semester: number }; criteria: CriteriaView[];
  dataset: Dataset; transcript: TranscriptPayload; today: string;
}): EligibilityResult {
  const { track, curriculumVersionId, admissionYear, term, transcript, dataset, today } = args;
  const base: EligibilityResult = { track, status: "awaiting_criteria", reasons: [], criteriaId: null, criteriaVersion: null, approval: "not_verified" };
  if (admissionYear === null) return { ...base, reasons: ["รอผู้ดูแลยืนยันปีที่เข้าศึกษา ไม่เดาจากรหัสนักศึกษา"] };
  const matches = args.criteria.filter(c => c.status === "published" && c.curriculumVersionId === curriculumVersionId && c.admissionYears.includes(admissionYear) && c.year === term.year && c.semester === term.semester && c.track === track && c.data.effectiveFrom <= today && c.data.effectiveUntil >= today);
  if (!matches.length) return { ...base, reasons: ["ยังไม่มีเกณฑ์ที่เผยแพร่และอยู่ในช่วงใช้ตรงรุ่นและรอบนี้ ไม่ใช้เกณฑ์รุ่นก่อนแทน"] };
  if (matches.length !== 1) return { ...base, status: "insufficient_data", reasons: ["เกณฑ์ซ้อนกัน ต้องให้ผู้ดูแลตรวจสอบ"] };
  const c = matches[0], d = c.data;
  base.criteriaId = c.id; base.criteriaVersion = c.version;
  if (completeness(c).length) return { ...base, status: "insufficient_data", reasons: ["ข้อมูลเกณฑ์ยังไม่ครบ ต้องให้ผู้ดูแลตรวจสอบ"] };
  const fail: string[] = [], unknown: string[] = [], manual: string[] = [];
  const termKey = (y: number, s: number) => y * 10 + s;
  // Only confirmed transcript rows before the requested registration term are considered.
  const attempts = transcript.attempts.filter(a => a.year !== null && a.semester !== null && termKey(a.year, a.semester) < termKey(term.year, term.semester));
  if (d.gpax.state === "specified") {
    const cutoff = termKey(d.gpax.throughYear!, d.gpax.throughSemester!);
    const rows = attempts.filter(a => termKey(a.year!, a.semester!) <= cutoff);
    const gpax = calculateGpa(rows, dataset);
    const hasCutoff = attempts.some(a => termKey(a.year!, a.semester!) === cutoff) || transcript.summaries.some(s => s.year !== null && s.semester !== null && termKey(s.year, s.semester) === cutoff);
    if (transcript.attempts.some(a => a.year === null || a.semester === null) || !hasCutoff || !gpax.confirmed || gpax.raw === null || rows.some(a => a.grade === null || ["I", "R", "X", "T"].includes(a.grade) || a.kind === "transfer")) unknown.push("GPAX ถึงภาคที่ประกาศใช้ยังสรุปไม่ได้จากข้อมูลยืนยัน");
    else if (gpax.raw < d.gpax.minimum!) fail.push(`GPAX ก่อนปัดต่ำกว่า ${d.gpax.minimum!.toFixed(2)} (ใช้ผลถึง ${d.gpax.throughYear}/${d.gpax.throughSemester})`);
  }
  if (d.courses.state === "specified") {
    const audited = auditTranscript({ ...transcript, attempts }, dataset, track);
    const outstanding: string[] = [];
    for (const code of d.courses.codes) {
      const result = audited.courses.find(r => r.code === code);
      const rows = chronological(attempts.filter(r => r.courseCode === code)), latest = rows.at(-1);
      if (transcript.attempts.some(a => a.courseCode === code && (a.year === null || a.semester === null)) || !result || result.status === "unknown") unknown.push(`${code}: ข้อมูลผลรายวิชาไม่พอ`);
      else if (result.status !== "passed") {
        // Only a confirmed ungraded registration row is evidence of in-progress study; I/R/X are not.
        if (d.courses.fulfillment === "passed_or_in_progress" && latest?.grade === null && latest.kind === "semester") continue;
        if (result.status === "pending") unknown.push(`${code}: ยังรอผล ต้องตรวจโดยเจ้าหน้าที่`);
        else outstanding.push(code);
      }
    }
    const allowed = d.exceptions.state === "specified" ? d.exceptions.allowedOutstanding! : 0;
    if (outstanding.length > allowed || outstanding.some(code => d.exceptions.cannotBeOutstanding.includes(code))) fail.push(`ยังไม่ผ่านชุดรายวิชา: ${outstanding.join(", ")}`);
    else if (outstanding.length && d.exceptions.approvalRequired) manual.push(`ต้องขออนุมัติข้อยกเว้นจาก ${d.exceptions.authority}`);
  }
  if (d.manual.state === "specified") manual.push(`${d.manual.description} — ตรวจโดย ${d.manual.responsibleUnit}`);
  return { ...base, status: fail.length ? "not_met" : unknown.length ? "insufficient_data" : manual.length ? "manual_review" : "preliminary_pass", reasons: [...fail, ...unknown, ...manual, "ผลนี้ไม่ใช่การอนุมัติจากภาควิชา และไม่เปลี่ยนสายจริง"] };
}
