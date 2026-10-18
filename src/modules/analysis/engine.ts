import type { Attempt, TranscriptPayload } from "@/modules/transcript/types";
import type { Course, Dataset, StudyTrack } from "@/modules/curriculum/types";

export const ENGINE_VERSION = "aps-v2-analysis-2026-10-18-v6";
export const GRADE_POINTS: Record<string, number> = {
  A: 4,
  "B+": 3.5,
  B: 3,
  "C+": 2.5,
  C: 2,
  "D+": 1.5,
  D: 1,
  F: 0,
};
export interface CourseResult {
  code: string;
  name: string;
  category: Course["category"];
  credits: number;
  status: "passed" | "failed" | "pending" | "missing" | "unknown";
  latestGrade: string | null;
  earnedCredits: number;
  reasons: string[];
}
export interface GpaResult {
  value: number | null;
  raw: number | null;
  credits: number;
  confirmed: boolean;
  assumptions: string[];
}
export interface AuditResult {
  engineVersion: string;
  datasetId: string;
  track: StudyTrack;
  courses: CourseResult[];
  groups: {
    category: Course["category"];
    minimum: number;
    earned: number;
    remaining: number;
    status: "met" | "not_met" | "unknown";
  }[];
  gpax: GpaResult;
  specificGpa: GpaResult;
  earnedCredits: number;
  reportedCredits: number;
  workloadCredits: number;
  unmapped: string[];
  warnings: string[];
  risk: {
    level: "unknown" | "critical" | "high" | "watch" | "low";
    message: string;
  };
  recovery: {
    courseCode: string;
    grade: string;
    targetGrade: string;
    diagnosticGpax: number | null;
    assumptions: string[];
  }[];
  graduation:
    | "requirements_not_met"
    | "not_evaluated"
    | "academic_checks_required";
}
export function chronological(rows: Attempt[]): Attempt[] {
  return [...rows].sort(
    (a, b) =>
      (a.year ?? 0) - (b.year ?? 0) ||
      (a.semester ?? 0) - (b.semester ?? 0) ||
      a.ordinal - b.ordinal,
  );
}
export function isPassed(grade: string | null): boolean {
  return (
    grade === "S" ||
    (grade != null && grade in GRADE_POINTS && GRADE_POINTS[grade] >= 1)
  );
}
export function effectiveGrade(row: Attempt, dataset: Dataset): string | null {
  if ((row.grade === "S*" || row.grade === "U*") && row.kind !== "transfer" &&
      dataset.policy.starGradeCourses?.includes(row.courseCode) &&
      dataset.courses.some((c) => c.code === row.courseCode && c.grading === "su" && c.credits === row.credits))
    return row.grade === "S*" ? "S" : "U";
  return row.grade;
}
function courseStatus(course: Course, rows: Attempt[], dataset: Dataset): CourseResult {
  const latest = rows.at(-1);
  const assessed = rows
    .filter(
      (r) =>
        effectiveGrade(r, dataset) != null &&
        (effectiveGrade(r, dataset)! in GRADE_POINTS || ["S", "U"].includes(effectiveGrade(r, dataset)!)),
    )
    .at(-1);
  const reasons: string[] = [];
  let status: CourseResult["status"] = "missing";
  if (rows.some((r) => effectiveGrade(r, dataset)?.endsWith("*") || r.kind === "transfer")) {
    status = "unknown";
    reasons.push("ต้องยืนยันนโยบายเกรดมีเครื่องหมายหรือการโอน");
  } else if (assessed) {
    if (assessed.credits !== course.credits) {
      status = "unknown";
      reasons.push("หน่วยกิตที่รายงานไม่ตรงข้อมูลหลักสูตร");
    } else if (
      course.grading === "unknown" ||
      (course.grading === "su" &&
        assessed.grade != null &&
        assessed.grade in GRADE_POINTS)
    ) {
      status = "unknown";
      reasons.push("ต้องยืนยันนโยบายเกรดรายวิชา");
    } else status = isPassed(effectiveGrade(assessed, dataset)) ? "passed" : "failed";
  } else if (latest) {
    status =
      latest.grade === "W"
        ? "missing"
        : [null, "I", "R", "X"].includes(latest.grade)
          ? "pending"
          : "unknown";
  }
  if (latest && latest !== assessed && latest.grade !== "W")
    reasons.push(
      "มีรายการใหม่ที่ยังไม่สิ้นสุด คงผลประเมินเดิมแยกจากรายการรอผล",
    );
  return {
    code: course.code,
    name: course.name,
    category: course.category,
    credits: course.credits,
    status,
    latestGrade: latest?.grade ?? null,
    earnedCredits:
      status === "passed" && course.category !== "non_degree"
        ? course.credits
        : 0,
    reasons,
  };
}
export function calculateGpa(
  rows: Attempt[],
  dataset: Dataset,
  specificOnly = false,
): GpaResult {
  const ordered = chronological(rows).filter((row) => {
    const course = dataset.courses.find((c) => c.code === row.courseCode);
    return (
      row.kind !== "transfer" &&
      row.grade != null &&
      row.grade in GRADE_POINTS &&
      row.credits != null &&
      (!specificOnly || course?.specific)
    );
  });
  let chosen = ordered;
  if (dataset.policy.repeat !== "all_attempts") {
    const last = new Map<string, Attempt>();
    for (const row of ordered) last.set(row.courseCode, row);
    chosen = [...last.values()];
  }
  const credits = chosen.reduce((sum, row) => sum + (row.credits ?? 0), 0);
  const weightedHalfPoints = chosen.reduce(
    (sum, row) => sum + (row.credits ?? 0) * GRADE_POINTS[row.grade!] * 2,
    0,
  );
  const raw = credits ? weightedHalfPoints / (credits * 2) : null;
  // Integer arithmetic avoids binary floating-point rounding at x.xx5.
  const divisor = credits * 2,
    scaled = weightedHalfPoints * 100;
  const value = credits
    ? (Math.floor(scaled / divisor) +
        ((scaled % divisor) * 2 >= divisor ? 1 : 0)) /
      100
    : null;
  const assumptions: string[] = [];
  if (dataset.policy.repeat === "unconfirmed")
    assumptions.push("ค่าวินิจฉัยใช้ผลตัวเลขล่าสุด ต้องยืนยันนโยบายเรียนซ้ำ");
  if (dataset.policy.rounding === "unconfirmed")
    assumptions.push(
      "ค่าวินิจฉัยปัดครึ่งขึ้นสองตำแหน่ง ต้องยืนยันการปัดและเทียบเกณฑ์",
    );
  if (dataset.policy.gpaComparison !== "raw")
    assumptions.push("ต้องยืนยันการใช้ค่าก่อนปัดเทียบเกณฑ์ GPA");
  if (specificOnly && dataset.policy.specificGpaBasis !== "all_specific")
    assumptions.push("ต้องยืนยันขอบเขต GPA เฉพาะด้านเมื่อเรียนเกินขั้นต่ำ");
  if (
    rows.some(
      (r) => r.kind === "transfer" || effectiveGrade(r, dataset)?.endsWith("*") || r.grade === "T",
    )
  )
    assumptions.push("มีเกรดหรือการโอนที่ยังยืนยันนโยบายไม่ได้");
  if (rows.some((r) => !dataset.courses.some((c) => c.code === r.courseCode)))
    assumptions.push("มีรายวิชายังไม่จับคู่หลักสูตร");
  return {
    value,
    raw,
    credits,
    confirmed: assumptions.length === 0,
    assumptions,
  };
}
export function passedForPrerequisites(
  rows: Attempt[],
  dataset: Dataset,
): Set<string> {
  const passed = new Set<string>();
  const ordered = chronological(rows);
  for (const course of dataset.courses) {
    if (course.grading === "unknown") continue;
    const attempts = ordered.filter(
      (r) =>
        r.courseCode === course.code &&
        r.kind !== "transfer",
    );
    if (attempts.some((r) => effectiveGrade(r, dataset)?.endsWith("*"))) continue;
    const assessed = attempts.filter(
      (r) =>
        effectiveGrade(r, dataset) != null &&
        (effectiveGrade(r, dataset)! in GRADE_POINTS || ["S", "U"].includes(effectiveGrade(r, dataset)!)),
    );
    const validPass = (row: Attempt) =>
      row.credits === course.credits &&
      !(course.grading === "su" && row.grade != null && row.grade in GRADE_POINTS) &&
      isPassed(effectiveGrade(row, dataset));
    const latestAssessment = assessed.at(-1);
    // Select the latest assessment before validating its credits/grading. Filtering
    // invalid newer data first would silently restore an older passing result.
    if (
      dataset.policy.prerequisitePass === "any_pass"
        ? assessed.some(validPass)
        : Boolean(latestAssessment && validPass(latestAssessment))
    )
      passed.add(course.code);
  }
  return passed;
}
function allocateElectives(courses: CourseResult[], rows: Attempt[], dataset: Dataset, track: StudyTrack) {
  const applicable = dataset.groups.filter(g => g.track === "both" || g.track === track);
  const minimum = applicable.find(g => g.category === "specific_elective")?.minimum;
  const hasFree = applicable.some(g => g.category === "free_elective");
  const candidates = courses.filter(c => c.category === "specific_elective" && c.status === "passed");
  const warnings: string[] = [];
  if (minimum == null || !hasFree) return { courses, warnings };
  if (dataset.policy.electiveAllocation !== "specific_then_free_earliest_pass") {
    if (candidates.reduce((sum,c) => sum + c.earnedCredits, 0) > minimum)
      warnings.push("มีวิชาเลือกเฉพาะเกินขั้นต่ำ แต่ยังไม่ยืนยันกฎจัดสรรไปเลือกเสรี");
    return { courses, warnings };
  }
  const firstPass = new Map<string, Attempt>();
  for (const course of candidates) {
    const passed = chronological(rows.filter(r => r.courseCode === course.code && r.kind !== "transfer" && r.credits === course.credits && isPassed(effectiveGrade(r, dataset))));
    if (passed.some(r => r.year == null || r.semester == null)) {
      warnings.push("ต้องยืนยันภาคที่ผ่านก่อนจัดสรรวิชาเลือกอัตโนมัติ ไม่เดาลำดับจากรายการที่ภาคไม่ครบ");
      return { courses, warnings };
    }
    if (passed[0]) firstPass.set(course.code, passed[0]);
  }
  const ordered = [...candidates].sort((a,b) => {
    const left = firstPass.get(a.code)!, right = firstPass.get(b.code)!;
    return left.year! - right.year! || left.semester! - right.semester! || a.code.localeCompare(b.code, "en");
  });
  let earned = 0;
  const allocation = new Map<string, Course["category"]>();
  for (const course of ordered) {
    allocation.set(course.code, earned < minimum ? "specific_elective" : "free_elective");
    earned += course.earnedCredits;
  }
  return { courses: courses.map(c => {
    const category = allocation.get(c.code);
    if (!category) return c;
    return { ...c, category, reasons: [...c.reasons, category === "free_elective"
      ? "จัดทั้งวิชาเป็นเลือกเสรีหลังเลือกเฉพาะครบขั้นต่ำ ไม่แบ่งหน่วยกิตและไม่นับซ้ำ; GPA เฉพาะด้านยังใช้ชนิดวิชาเดิม"
      : "จัดทั้งวิชาเป็นเลือกเฉพาะตามภาคที่ผ่านก่อน แล้วรหัสวิชา"] };
  }), warnings };
}
export function auditTranscript(
  payload: TranscriptPayload,
  dataset: Dataset,
  track: StudyTrack,
): AuditResult {
  const rows = chronological(payload.attempts);
  const originalCourses = dataset.courses
    .filter((c) => !c.tracks.length || c.tracks.includes(track))
    .map((course) =>
      courseStatus(
        course,
        rows.filter((r) => r.courseCode === course.code),
        dataset,
      ),
    );
  const allocation = allocateElectives(originalCourses, rows, dataset, track);
  const courses = allocation.courses;
  const unmapped = [
    ...new Set(
      rows
        .filter((r) => !dataset.courses.some((c) => c.code === r.courseCode))
        .map((r) => r.courseCode),
    ),
  ];
  const groups = dataset.groups
    .filter((g) => g.track === "both" || g.track === track)
    .map((group) => {
      const relevant = courses.filter((c) => c.category === group.category);
      const earned = relevant.reduce((sum, c) => sum + c.earnedCredits, 0);
      const uncertain = relevant.some((c) => c.status === "unknown");
      return {
        category: group.category,
        minimum: group.minimum,
        earned,
        remaining: Math.max(0, group.minimum - earned),
        status:
          earned >= group.minimum
            ? ("met" as const)
            : uncertain
              ? ("unknown" as const)
              : ("not_met" as const),
      };
    });
  const gpax = calculateGpa(rows, dataset),
    specificGpa = calculateGpa(rows, dataset, true);
  const earnedCredits = courses.reduce(
    (sum, course) => sum + course.earnedCredits,
    0,
  );
  const warnings = [
    ...dataset.unresolved,
    ...allocation.warnings,
    ...gpax.assumptions,
    ...specificGpa.assumptions,
  ];
  if (unmapped.length) warnings.push(`ยังไม่จัดหมวด: ${unmapped.join(", ")}`);
  if (dataset.policy.prerequisitePass === "unconfirmed")
    warnings.push(
      "สิทธิ์วิชาต่อเนื่องเมื่อเรียนซ้ำยังไม่ยืนยัน ผลใช้การประเมินล่าสุดเป็นสมมติฐาน",
    );
  if (courses.some((c) => c.status === "unknown"))
    warnings.push("มีผลรายวิชาที่ยังสรุปไม่ได้");
  const requiredMissing = courses.some(
    (c) =>
      [
        "general_required",
        "core_required",
        "specific_required",
        "track_required",
      ].includes(c.category) && ["missing", "failed"].includes(c.status),
  );
  const risk =
    gpax.raw == null
      ? { level: "unknown" as const, message: "ยังไม่มีผลตัวเลขพอประเมิน GPAX" }
      : gpax.raw < 1.5
        ? {
            level: "critical" as const,
            message:
              "GPAX ต่ำกว่า 1.50 เป็นความเสี่ยงวิกฤตภายใน APS ควรตรวจสอบกับอาจารย์ที่ปรึกษาหรือทะเบียน",
          }
        : gpax.raw < 1.8
          ? {
              level: "high" as const,
              message:
                "โปรต่ำตามระดับความเสี่ยง APS ควรวางแผนฟื้น GPAX และตรวจวิชาที่ขวางแผน",
            }
          : gpax.raw < 2
            ? {
                level: "watch" as const,
                message:
                  "โปรสูงตามระดับความเสี่ยง APS ควรติดตาม GPAX และประวัติรอพินิจ",
              }
            : {
                level: "low" as const,
                message:
                  "ไม่เข้าเกณฑ์โปรต่ำ/โปรสูงของ APS ยังต้องตรวจรายวิชาและเงื่อนไขอื่น",
              };
  return {
    engineVersion: ENGINE_VERSION,
    datasetId: dataset.id,
    track,
    courses,
    groups,
    gpax,
    specificGpa,
    earnedCredits,
    reportedCredits: rows.reduce((s, r) => s + (r.credits ?? 0), 0),
    workloadCredits: rows
      .filter((r) => r.grade !== "W")
      .reduce((s, r) => s + (r.credits ?? 0), 0),
    unmapped,
    warnings: [...new Set(warnings)],
    risk,
    recovery:
      gpax.raw != null && gpax.raw < 2
        ? dataset.courses
            .flatMap((course) => {
              const assessed = rows
                .filter(
                  (r) =>
                    r.courseCode === course.code &&
                    r.grade != null &&
                    r.grade in GRADE_POINTS,
                )
                .at(-1);
              if (
                !assessed?.grade ||
                dataset.policy.retakeCeiling == null ||
                GRADE_POINTS[assessed.grade] > dataset.policy.retakeCeiling ||
                course.grading !== "numeric" ||
                assessed.kind === "transfer"
              )
                return [];
              const hypothetical = [
                ...rows,
                {
                  ...assessed,
                  ordinal: rows.length,
                  grade: "B",
                  year: (rows.at(-1)?.year ?? 0) + 1,
                },
              ];
              const next = calculateGpa(hypothetical, dataset);
              return [
                {
                  courseCode: course.code,
                  grade: assessed.grade,
                  targetGrade: "B",
                  diagnosticGpax: next.value,
                  assumptions: [
                    ...next.assumptions,
                    "เป็นตัวเลือกให้ตรวจสิทธิ์เรียนซ้ำและการเปิดสอน ไม่ใช่การอนุมัติลงทะเบียน",
                  ],
                },
              ];
            })
            .sort((a, b) => (b.diagnosticGpax ?? 0) - (a.diagnosticGpax ?? 0))
        : [],
    graduation:
      requiredMissing ||
      groups.some((g) => g.status === "not_met") ||
      earnedCredits < dataset.policy.degreeCredits ||
      (gpax.confirmed && (gpax.raw == null || gpax.raw < dataset.policy.gpaMinimum)) ||
      (specificGpa.confirmed && (specificGpa.raw == null || specificGpa.raw < dataset.policy.gpaMinimum))
        ? "requirements_not_met"
        : warnings.length ||
            courses.some((c) => c.status === "pending") ||
            !gpax.confirmed ||
            !specificGpa.confirmed
          ? "not_evaluated"
          : "academic_checks_required",
  };
}
