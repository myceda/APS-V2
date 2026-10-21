import type { Dataset } from "./types";

const effects: Record<string, string> = {
  "01": "การนับหมวดวิชาเลือก",
  "02": "สถานภาพตามข้อบังคับและผลสรุปการศึกษา",
  "03": "ข้อยกเว้นวิชาก่อนและการเรียนพร้อม",
  "04": "สิทธิ์และเงื่อนไขโครงงาน",
  "05": "เกรดพิเศษและหน่วยกิต",
  "06": "การเรียนซ้ำและสิทธิ์วิชาต่อ",
  "07": "GPA และการเทียบเกณฑ์",
  "08": "ภาระเรียนและข้อยกเว้น",
  "09": "ระยะเวลาศึกษาและรอบจำแนก",
  "10": "สิทธิ์และเงื่อนไขสหกิจ",
  "11": "เงื่อนไขภาษาอังกฤษ",
  "12": "การโอนและเทียบรายวิชา",
  "14": "การจัดวิชาตามปีและภาคที่เปิดสอน",
  "15": "การจัดสรรวิชาเลือกและหน่วยกิต",
  "16": "รูปแบบเกรดของวิชาโครงงานและสหกิจ",
  "17": "ข้อมูลรายวิชาที่ผู้ดูแลเพิ่ม",
};

// Publishing a catalogue enables supported calculations; it never verifies an
// unknown rule. Keep this policy shared by the server response and its preview.
export function publicationReadiness(dataset: Dataset) {
  return {
    capabilities: {
      diagnosticGpa: true,
      confirmedGpa: dataset.policy.repeat !== "unconfirmed" &&
        dataset.policy.rounding !== "unconfirmed" &&
        dataset.policy.gpaComparison === "raw" &&
        dataset.policy.specificGpaBasis === "all_specific",
      fullAcademicConclusion: false,
    },
    limitations: dataset.unresolved.map(rule => {
      const codes = rule.match(/OPEN-(\d+(?:\/\d+)*)/)?.[1].split("/") ?? [];
      return { rule, affects: [...new Set(codes.map(code => effects[code] ?? "ผลสรุปการศึกษาที่พึ่งกฎนี้"))].join("; ") || "ผลสรุปการศึกษาที่พึ่งกฎนี้" };
    }),
  };
}
