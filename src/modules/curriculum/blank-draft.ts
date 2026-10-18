import { CATEGORY_NAMES, type Dataset } from "./types";

/** Form starting values only: no university rules or CS2565 data are inferred. */
export function blankDraft(): Pick<Dataset, "source" | "courses" | "groups" | "offerings" | "policy" | "unresolved"> {
  const source = "ร่างว่าง — ต้องระบุข้อมูลและแหล่งอ้างอิงของหลักสูตรก่อนเผยแพร่";
  return {
    source, courses: [], offerings: [],
    groups: (Object.keys(CATEGORY_NAMES) as Dataset["groups"][number]["category"][])
      .filter(category => !["unmapped", "non_degree"].includes(category))
      .map(category => ({ category, minimum: 0, track: "both", source })),
    policy: { degreeCredits: 1, gpaMinimum: 0, retakeCeiling: null, repeat: "unconfirmed", rounding: "unconfirmed", prerequisitePass: "unconfirmed", normalMax: 1, normalMin: null, summerMax: 1, electiveAllocation: "unconfirmed", gpaComparison: "unconfirmed", specificGpaBasis: "unconfirmed", starGradeCourses: [], source },
    unresolved: ["ร่างว่างนี้ไม่มีข้อมูลหลักสูตรรับรอง ค่าหน่วยกิต ภาระเรียน GPA และขั้นต่ำหมวดเป็นค่าเริ่มต้นของฟอร์ม ต้องแทนด้วยข้อมูลที่ตรวจจากแหล่งอ้างอิงก่อนใช้งาน", "ยังไม่ยืนยันนโยบายการคำนวณและเงื่อนไขของหลักสูตรนี้"],
  };
}
