import type { Dataset, StudyTrack, Term } from "@/modules/curriculum/types";
import type { TranscriptPayload } from "@/modules/transcript/types";
import {
  auditTranscript,
  chronological,
  GRADE_POINTS,
  isPassed,
} from "@/modules/analysis/engine";
import {
  makePlan,
  resolveOffering,
  termKey,
  type PlanningParameters,
} from "@/modules/planning/engine";

export interface ScenarioEvent {
  action: "add" | "drop" | "fail";
  courseCode: string;
  term: Term;
  grade: string | null;
}
export interface OfferingAssumption {
  courseCode: string;
  term: Term;
  availability: "open" | "closed";
}
export function simulate(
  payload: TranscriptPayload,
  dataset: Dataset,
  track: StudyTrack,
  parameters: PlanningParameters,
  events: ScenarioEvent[],
  offeringAssumptions: OfferingAssumption[] = [],
) {
  if (
    !Array.isArray(events) ||
    !Array.isArray(offeringAssumptions) ||
    events.length + offeringAssumptions.length < 1 ||
    events.length + offeringAssumptions.length > 30
  )
    throw new Error("ต้องมีเหตุการณ์หรือสมมติฐานจำลองรวม 1–30 รายการ");
  const baseline = makePlan(payload, dataset, track, parameters, "actual");
  const scenarioDataset = structuredClone(dataset);
  const assumedKeys = new Set<string>();
  for (const assumption of offeringAssumptions) {
    if (
      !assumption ||
      !dataset.courses.some(
        (c) =>
          c.code === assumption.courseCode &&
          (!c.tracks.length || c.tracks.includes(track)),
      ) ||
      !assumption.term ||
      !Number.isInteger(assumption.term.year) ||
      ![1, 2, 3].includes(assumption.term.semester) ||
      !["open", "closed"].includes(assumption.availability) ||
      termKey(assumption.term) < termKey(parameters.currentTerm) ||
      termKey(assumption.term) >=
        termKey(parameters.currentTerm) + parameters.horizon
    )
      throw new Error("สมมติฐานเปิดสอนต้องเป็นวิชาและภาคในช่วงแผนที่เลือก");
    const key = `${assumption.courseCode}:${termKey(assumption.term)}`;
    if (assumedKeys.has(key)) throw new Error("สมมติฐานเปิดสอนวิชาและภาคซ้ำ");
    assumedKeys.add(key);
    if (
      resolveOffering(dataset, assumption.courseCode, assumption.term)
        .availability !== "unknown"
    )
      throw new Error(
        "จำลองเปิดสอนเฉพาะข้อมูลที่ยังไม่ทราบ ไม่แทนที่ข้อมูลเปิดหรือปิดที่มีอยู่",
      );
    scenarioDataset.offerings = scenarioDataset.offerings.filter(
      (o) =>
        !(
          o.courseCode === assumption.courseCode &&
          o.year === assumption.term.year &&
          o.semester === assumption.term.semester
        ),
    );
    scenarioDataset.offerings.push({
      courseCode: assumption.courseCode,
      ...assumption.term,
      availability: assumption.availability,
      confidence: "planned",
      source: "สมมติฐานเฉพาะสถานการณ์ของผู้ใช้",
    });
  }
  const simulated = structuredClone(payload),
    forbidden = new Map<string, Set<number>>();
  const seen = new Set<string>();
  for (const event of events) {
    if (!event || typeof event !== "object")
      throw new Error("ข้อมูลเหตุการณ์จำลองไม่ถูกต้อง");
    const course = dataset.courses.find(
      (c) =>
        c.code === event.courseCode &&
        (!c.tracks.length || c.tracks.includes(track)),
    );
    if (!course) throw new Error("ไม่พบวิชาในสายที่จำลอง");
    if (
      !["add", "drop", "fail"].includes(event.action) ||
      !event.term ||
      !Number.isInteger(event.term.year) ||
      ![1, 2, 3].includes(event.term.semester) ||
      termKey(event.term) < termKey(parameters.currentTerm) ||
      termKey(event.term) >=
        termKey(parameters.currentTerm) + parameters.horizon
    )
      throw new Error("เหตุการณ์ต้องอยู่ในช่วงแผนที่เลือก");
    const key = `${event.courseCode}:${termKey(event.term)}`;
    if (seen.has(key)) throw new Error("เหตุการณ์วิชาและภาคซ้ำ");
    seen.add(key);
    if (
      event.action !== "add" &&
      !baseline.terms.some(
        (t) =>
          termKey(t.term) === termKey(event.term) &&
          t.courses.some((c) => c.code === event.courseCode),
      )
    )
      throw new Error("ถอนหรือไม่ผ่านต้องเลือกวิชาที่อยู่ในภาคของแผนฐาน");
    if (event.action === "drop") {
      if (!forbidden.has(course.code)) forbidden.set(course.code, new Set());
      forbidden.get(course.code)!.add(termKey(event.term));
      continue;
    }
    const prior = chronological(payload.attempts)
      .filter(
        (r) =>
          r.courseCode === course.code &&
          r.grade != null &&
          r.grade in GRADE_POINTS,
      )
      .at(-1);
    if (
      event.action === "add" &&
      prior &&
      (dataset.policy.retakeCeiling == null ||
        GRADE_POINTS[prior.grade!] > dataset.policy.retakeCeiling)
    )
      throw new Error(
        "เกรดเดิมสูงกว่าเกณฑ์ หรือเพดานยังไม่ยืนยัน ต้องตรวจสิทธิ์เรียนซ้ำก่อนจำลองเพิ่ม",
      );
    if (course.grading === "unknown")
      throw new Error("ยังไม่ยืนยันนโยบายเกรด ไม่กำหนด F/U แทนเอง");
    const grade =
      event.action === "fail"
        ? course.grading === "su"
          ? "U"
          : "F"
        : event.grade;
    if (
      course.grading === "su"
        ? !["S", "U"].includes(grade ?? "")
        : typeof grade !== "string" || !Object.hasOwn(GRADE_POINTS, grade)
    )
      throw new Error("เกรดจำลองไม่ตรงชนิดเกรดรายวิชา");
  }
  const changed = makePlan(
    payload,
    scenarioDataset,
    track,
    parameters,
    "assumption",
    forbidden,
    events,
  );
  for (const event of events.filter(e => e.action !== "drop")) {
    const applied = changed.terms.some(t => termKey(t.term) === termKey(event.term) && t.courses.some(c => c.code === event.courseCode));
    if (!applied)
      changed.limitations.push(
        `${event.courseCode} ${event.term.year}/${event.term.semester}: ไม่ได้ใช้เหตุการณ์${event.action === "add" ? "เพิ่มวิชา/เกรดสมมติ" : "ไม่ผ่าน"}ในภาคที่ขอ วิชาที่จัดในภาคอื่นใช้สมมติฐานของแผนอัตโนมัติ ต้องตรวจเหตุผลก่อนใช้ผล`,
      );
  }
  changed.assumptions.push(
    ...offeringAssumptions.map(
      (a) =>
        `${a.courseCode} ${a.term.year}/${a.term.semester}: สมมติ${a.availability === "open" ? "เปิด" : "ไม่เปิด"}สอน ข้อมูลจริงยังไม่ทราบ`,
    ),
  );
  for (const plan of changed.terms)
    for (const course of plan.courses)
      simulated.attempts.push({
        ordinal: simulated.attempts.length,
        courseCode: course.code,
        name: course.name,
        credits: course.credits,
        grade: course.grade,
        gradePoints: null,
        ...plan.term,
        kind: "semester",
        sourcePage: 0,
      });
  const changes = dataset.courses
    .map((course) => {
      const before =
        baseline.terms.find((t) =>
          t.courses.some((c) => c.code === course.code),
        )?.term ?? null;
      const after =
        changed.terms
          .filter((t) =>
            t.courses.some((c) => c.code === course.code && isPassed(c.grade)),
          )
          .at(-1)?.term ?? null;
      return { courseCode: course.code, before, after };
    })
    .filter((c) => JSON.stringify(c.before) !== JSON.stringify(c.after));
  return {
    baseline,
    changed,
    events: structuredClone(events),
    offeringAssumptions: structuredClone(offeringAssumptions),
    changes,
    termDifference:
      baseline.graduationTerm && changed.graduationTerm
        ? termKey(changed.graduationTerm) - termKey(baseline.graduationTerm)
        : null,
    explanation:
      baseline.graduationTerm && changed.graduationTerm
        ? "เปรียบเทียบภายใต้ฉบับข้อมูลและกลไกเดียวกัน"
        : "อย่างน้อยหนึ่งด้านยังคาดภาคจบไม่ได้ จึงไม่สร้างผลต่างภาค",
    simulatedAudit: auditTranscript(simulated, dataset, track),
  };
}
