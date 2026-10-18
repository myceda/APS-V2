import type { Dataset, StudyTrack } from "../../src/modules/curriculum/types";
import type { PlanningParameters } from "../../src/modules/planning/engine";
import type { ScenarioEvent, OfferingAssumption } from "../../src/modules/simulation/engine";
import { catalogue, row, tracks } from "./round-5-plans";
import { transcript } from "./track-criteria";

export const simulationParameters: PlanningParameters = {
  currentTerm: { year: 2569, semester: 1 }, normalLoad: 8, summerLoad: 4,
  horizon: 3, targetGrade: "B", assumeUnknownOfferings: false,
};
export function simulationData(): Dataset {
  const data = catalogue(["517101", "511108", "517121", "517122", "517392", "517111"]);
  // Mathematical subset ONLY: totals do not describe completion of CS2565.
  data.policy.degreeCredits = 15; data.policy.normalMin = 0;
  data.unresolved = []; data.source = "Synthetic Round 6 subset, NOT full CS2565 approval";
  return data;
}
export function simulationPayload() {
  return transcript([row("517101", "B"), row("511108", "B", 1), row("517121", "W", 2)]);
}
export type SimulationCase = {
  id: string; track: StudyTrack; description: string; data: Dataset;
  payload: ReturnType<typeof simulationPayload>; parameters: PlanningParameters;
  events: ScenarioEvent[]; offerings: OfferingAssumption[];
  expected: { error?: string; before?: string[][]; after?: string[][]; gpax?: string; difference?: number | null; warning?: string };
};
const before = [["517121:B", "517392:S"], ["517122:B"]];
const event = (action: ScenarioEvent["action"], code = "517121", grade: string | null = null, semester: 1 | 2 | 3 = 1): ScenarioEvent => ({ action, courseCode: code, term: { year: 2569, semester }, grade });

// Hand-derived expected terms/grades and rational GPAX, never from engine output.
export function simulationCases(): SimulationCase[] {
  const cases: SimulationCase[] = [];
  for (const track of tracks) {
    const add = (id: string, description: string, events: ScenarioEvent[], expected: SimulationCase["expected"], data = simulationData(), payload = simulationPayload(), parameters = simulationParameters, offerings: OfferingAssumption[] = []) => cases.push({ id: `${id}-${track}`, description, track, data, payload, parameters: structuredClone(parameters), events, offerings, expected });
    for (const [grade, gpax] of [["A", "23/7"], ["B", "3"], ["C", "19/7"]]) add(`numeric-grade-${grade.toLowerCase()}`, "เปลี่ยนเกรดสมมติของวิชาตัวเลขในภาคที่กำหนด", [event("add", "517121", grade)], { before, after: [[`517121:${grade}`, "517392:S"], ["517122:B"]], gpax, difference: 0 });
    add("drop-numeric", "ถอนเฉพาะแผนภาคแรก ตัวต่อเลื่อนหลังเรียนใหม่ ไม่สร้างWจริง", [event("drop")], { before, after: [["517392:S"], ["517121:B"], ["517122:B"]], gpax: "3", difference: 1 });
    add("fail-numeric", "สมมติFแล้วเรียนใหม่ ตัวต่อรอผ่าน; GPAสุดแผนใช้ตัวเลขล่าสุด", [event("fail")], { before, after: [["517121:F", "517392:S"], ["517121:B"], ["517122:B"]], gpax: "3", difference: 1 });
    add("drop-su", "ถอนวิชาS/Uและยังจบแผนย่อยภาคเดิมได้", [event("drop", "517392")], { before, after: [["517121:B"], ["517122:B", "517392:S"]], gpax: "3", difference: 0 });
    for (const action of ["fail", "add"] as const) add(`${action}-su-u`, "S/Uไม่ผ่านใช้U ไม่สร้างF; เรียนใหม่เป็นSสมมติ", [event(action, "517392", action === "add" ? "U" : null)], { before, after: [["517121:B", "517392:U"], ["517122:B", "517392:S"]], gpax: "3", difference: 0 });
    add("add-su-s", "S/UรับเกรดSและไม่เพิ่มตัวหารGPA", [event("add", "517392", "S")], { before, after: before, gpax: "3", difference: 0 });
    add("blocked-prerequisite", "ขอ517122ก่อนผ่าน517121 ต้องอธิบายว่าเหตุการณ์ไม่ได้ใช้ในภาคที่ขอ", [event("add", "517122", "A")], { before, after: before, gpax: "3", difference: 0, warning: "ต้องผ่าน" });
    add("blocked-load", "ขอวิชาเกินภาระ ไม่ทำเกรดสมมติสำเร็จเงียบในภาคอื่น", [event("add", "517392", "S")], { before: [["517121:B"], ["517122:B"], ["517392:S"]], after: [["517121:B"], ["517122:B"], ["517392:S"]], gpax: "3", difference: 0, warning: "เกินภาระเรียน" }, simulationData(), simulationPayload(), { ...simulationParameters, normalLoad: 4 });
    const unknown = simulationData();
    for (const o of unknown.offerings.filter(o => o.courseCode === "517122")) o.availability = "unknown";
    add("offering-open-term2", "เปลี่ยนunknownเป็นopenเฉพาะภาค2ในสถานการณ์", [], { before: [["517121:B", "517392:S"], [], []], after: before, gpax: "3", difference: null }, structuredClone(unknown), simulationPayload(), simulationParameters, [{ courseCode: "517122", term: { year: 2569, semester: 2 }, availability: "open" }]);
    add("offering-closed-term2", "สมมติclosedเฉพาะภาค2 ภาคอื่นยังunknown", [], { before: [["517121:B", "517392:S"], [], []], after: [["517121:B", "517392:S"], [], []], gpax: "3", difference: null }, unknown, simulationPayload(), simulationParameters, [{ courseCode: "517122", term: { year: 2569, semester: 2 }, availability: "closed" }]);
    const limited = simulationData(); limited.unresolved = ["Synthetic OPEN retained, not a graduation approval"];
    add("both-graduations-unknown", "ด้านใดคาดจบไม่ได้ต้องไม่สร้างผลต่างภาค", [event("add", "517121", "A")], { before, after: [["517121:A", "517392:S"], ["517122:B"]], gpax: "23/7", difference: null }, limited);
    add("combined-drop-and-u", "สองเหตุการณ์ต่างวิชาใช้ร่วมกันโดยไม่แก้ประวัติ", [event("drop"), event("add", "517392", "U")], { before, after: [["517392:U"], ["517121:B", "517392:S"], ["517122:B"]], gpax: "3", difference: 1 });
    add("unapplied-later-grade", "เกรดภาคหลังที่วิชาถูกจัดผ่านก่อนแล้วต้องแจ้งว่าไม่ได้ใช้", [event("add", "517121", "B"), event("add", "517121", "A", 2)], { before, after: before, gpax: "3", difference: 0, warning: "ไม่ได้ใช้เหตุการณ์" });
    for (const grade of ["S", "U", "toString", "constructor", "__proto__"]) add(`invalid-numeric-${grade}`, "เกรดตัวเลขรับเฉพาะค่าที่รองรับ ไม่รับpropertyของObject", [event("add", "517121", grade)], { error: "เกรดจำลองไม่ตรง" });
    for (const grade of ["A", "F"]) add(`invalid-su-${grade}`, "S/Uไม่รับเกรดตัวเลข", [event("add", "517392", grade)], { error: "เกรดจำลองไม่ตรง" });
    const unknownGrade = simulationData(); unknownGrade.courses.find(c => c.code === "517392")!.grading = "unknown";
    add("unknown-grading", "ไม่กำหนดF/Uเมื่อชนิดเกรดไม่ทราบ", [event("add", "517392", "S")], { error: "ยังไม่ยืนยันนโยบายเกรด" }, unknownGrade);
    add("retake-above-ceiling", "ผลจริงBเกินเพดานเรียนซ้ำ ไม่ให้เพิ่มเพื่อปรับเกรด", [event("add", "517121", "A")], { error: "สูงกว่าเกณฑ์" }, simulationData(), transcript([row("517101", "B"), row("511108", "B", 1), row("517121", "B", 2)]));
    add("drop-not-in-baseline", "ไม่สร้างถอนย้อนหลังจากวิชาที่ไม่อยู่ในภาคฐาน", [event("drop", "517122")], { error: "ต้องเลือกวิชาที่อยู่ในภาค" });
    add("duplicate-event", "ไม่รับสองเหตุการณ์วิชาเดียวภาคเดียว", [event("add", "517121", "A"), event("add", "517121", "C")], { error: "เหตุการณ์วิชาและภาคซ้ำ" });
    add("empty-scenario", "ไม่มีเหตุการณ์หรือสมมติฐานไม่สร้างสถานการณ์ว่าง", [], { error: "1–30" });
    add("outside-horizon", "เหตุการณ์นอกช่วงค้นหาถูกปฏิเสธ", [{ ...event("add", "517121", "A"), term: { year: 2570, semester: 1 } }], { error: "ช่วงแผน" });
    add("override-known-open", "ไม่ใช้สมมติฐานทับopeningที่รู้อยู่แล้ว", [], { error: "ไม่แทนที่ข้อมูล" }, simulationData(), simulationPayload(), simulationParameters, [{ courseCode: "517121", term: { year: 2569, semester: 1 }, availability: "closed" }]);
  }
  return cases;
}
