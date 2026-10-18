import { choice, integer, record, text } from "@/modules/curriculum/validation";
import { CONDITION_NAMES, type CriteriaData, type CriteriaInput } from "./types";
const str = (v: unknown, max = 3000) => typeof v === "string" && v.length <= max ? v.trim() : (() => { throw new Error("ข้อความไม่ถูกต้องหรือยาวเกินกำหนด"); })();
const codes = (v: unknown) => {
  if (!Array.isArray(v) || v.length > 300) throw new Error("รายการรหัสวิชาไม่ถูกต้อง");
  const result = v.map(c => text(c, 20));
  if (new Set(result).size !== result.length) throw new Error("รหัสวิชาซ้ำ");
  return result;
};
export function validDate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
}
function condition(v: unknown) {
  const r = record(v);
  return { state: choice(r.state, ["unknown", "specified", "not_required"] as const), evidence: str(r.evidence) };
}
export function parseCriteria(value: unknown): CriteriaInput {
  const v = record(value), d = record(v.data), g = record(d.gpax), c = record(d.courses), e = record(d.exceptions), m = record(d.manual), s = record(d.source);
  if (!Array.isArray(v.admissionYears) || v.admissionYears.length > 30) throw new Error("ปีเข้าศึกษาไม่ถูกต้อง");
  const years = v.admissionYears.map(y => integer(y, 2500, 2700));
  if (new Set(years).size !== years.length) throw new Error("ปีเข้าศึกษาซ้ำ");
  if (e.approvalRequired !== null && typeof e.approvalRequired !== "boolean") throw new Error("สถานะอนุมัติข้อยกเว้นไม่ถูกต้อง");
  if (g.minimum !== null && (typeof g.minimum !== "number" || !Number.isFinite(g.minimum) || g.minimum < 0 || g.minimum > 4 || Math.abs(g.minimum * 100 - Math.round(g.minimum * 100)) > 1e-8)) throw new Error("GPAX ต้องอยู่ระหว่าง 0–4 และไม่เกินสองตำแหน่ง");
  const data: CriteriaData = {
    effectiveFrom: str(d.effectiveFrom, 10), effectiveUntil: str(d.effectiveUntil, 10), targetCourseCodes: codes(d.targetCourseCodes),
    gpax: { ...condition(g), minimum: g.minimum as number | null, throughYear: g.throughYear === null ? null : integer(g.throughYear, 2500, 2700), throughSemester: g.throughSemester === null ? null : integer(g.throughSemester, 1, 3) },
    courses: { ...condition(c), codes: codes(c.codes), fulfillment: choice(c.fulfillment, ["passed", "passed_or_in_progress"] as const) },
    exceptions: { ...condition(e), allowedOutstanding: e.allowedOutstanding === null ? null : integer(e.allowedOutstanding, 0, 300), cannotBeOutstanding: codes(e.cannotBeOutstanding), approvalRequired: e.approvalRequired, authority: str(e.authority) },
    manual: { ...condition(m), description: str(m.description), responsibleUnit: str(m.responsibleUnit) },
    source: { title: str(s.title), unit: str(s.unit), date: str(s.date, 10), url: str(s.url, 2000), locator: str(s.locator), verification: str(s.verification) },
  };
  for (const date of [data.effectiveFrom, data.effectiveUntil, data.source.date]) if (date && !validDate(date)) throw new Error("วันที่ไม่ถูกต้อง");
  if (data.effectiveFrom && data.effectiveUntil && data.effectiveFrom > data.effectiveUntil) throw new Error("วันสิ้นสุดต้องไม่ก่อนวันเริ่ม");
  if (data.source.url) {
    const url = new URL(data.source.url);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("ลิงก์ต้องเป็น http/https และไม่มีข้อมูลเข้าสู่ระบบ");
  }
  // Erase inactive values on the server too; hidden old form values never become rules.
  if (data.gpax.state !== "specified") Object.assign(data.gpax, { minimum: null, throughYear: null, throughSemester: null });
  if (data.courses.state !== "specified") Object.assign(data.courses, { codes: [], fulfillment: "passed" });
  if (data.exceptions.state !== "specified") Object.assign(data.exceptions, { allowedOutstanding: null, cannotBeOutstanding: [], approvalRequired: null, authority: "" });
  if (data.manual.state !== "specified") Object.assign(data.manual, { description: "", responsibleUnit: "" });
  if (data.exceptions.state === "specified" && data.courses.state !== "specified") throw new Error("ข้อยกเว้นต้องอ้างชุดรายวิชาที่กำหนด");
  if (data.exceptions.cannotBeOutstanding.some(code => !data.courses.codes.includes(code))) throw new Error("วิชาที่ห้ามขาดต้องอยู่ในชุดรายวิชา");
  if (data.exceptions.allowedOutstanding !== null && data.exceptions.allowedOutstanding > data.courses.codes.length) throw new Error("จำนวนวิชาที่อนุโลมเกินขนาดชุดวิชา");
  return { curriculumVersionId: text(v.curriculumVersionId, 100), catalogueDatasetId: v.catalogueDatasetId == null ? null : text(v.catalogueDatasetId, 100), admissionYears: years.sort(), track: choice(v.track, ["project", "cooperative"] as const), year: integer(v.year, 2500, 2700), semester: integer(v.semester, 1, 3), data };
}
export function completeness(input: CriteriaInput): string[] {
  const d = input.data, issues: string[] = [];
  if (!input.admissionYears.length) issues.push("ระบุปีที่เข้าศึกษา");
  if (!input.catalogueDatasetId) issues.push("เลือกฉบับทะเบียนหลักสูตร");
  if (!d.targetCourseCodes.length) issues.push("เลือกวิชาที่ใช้พิจารณาสิทธิ์");
  if (!d.effectiveFrom || !d.effectiveUntil) issues.push("ระบุช่วงวันที่มีผล");
  if (!d.source.title || !d.source.unit || !d.source.date || !d.source.locator || !d.source.verification) issues.push("กรอกชื่อประกาศ หน่วยงาน วันที่ ตำแหน่งข้อความ และวิธีตรวจหลักฐาน");
  for (const key of ["gpax", "courses", "exceptions", "manual"] as const) {
    if (d[key].state === "unknown") issues.push(`${CONDITION_NAMES[key]}: ยังไม่ทราบ`);
    else if (!d[key].evidence) issues.push(`${CONDITION_NAMES[key]}: ระบุข้อความอ้างอิง/ข้อในเอกสาร`);
  }
  if (d.gpax.state === "specified" && (d.gpax.minimum === null || d.gpax.throughYear === null || d.gpax.throughSemester === null)) issues.push("GPAX ต้องมีค่าขั้นต่ำและภาคผลการเรียนที่ใช้");
  if (d.gpax.throughYear !== null && (d.gpax.throughYear * 10 + (d.gpax.throughSemester ?? 0)) >= input.year * 10 + input.semester) issues.push("ภาคผลการเรียนต้องก่อนรอบที่ขอลงทะเบียน");
  if (d.courses.state === "specified" && !d.courses.codes.length) issues.push("เลือกชุดรายวิชาที่ต้องผ่าน");
  if (d.exceptions.state === "specified" && (d.exceptions.allowedOutstanding === null || d.exceptions.approvalRequired === null || (d.exceptions.approvalRequired && !d.exceptions.authority))) issues.push("กรอกจำนวนวิชาอนุโลมและหน่วยงานอนุมัติ");
  if (d.manual.state === "specified" && (!d.manual.description || !d.manual.responsibleUnit)) issues.push("กรอกเงื่อนไขตรวจด้วยคนและหน่วยงาน");
  return issues;
}
