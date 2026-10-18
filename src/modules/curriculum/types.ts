export type StudyTrack = "project" | "cooperative";
export type CourseCategory =
  | "general_required"
  | "general_elective"
  | "core_required"
  | "specific_required"
  | "track_required"
  | "specific_elective"
  | "free_elective"
  | "non_degree"
  | "unmapped";
export interface Term {
  year: number;
  semester: 1 | 2 | 3;
}
export interface Prerequisite {
  mode: "all" | "any";
  courses: string[];
  concurrent: boolean;
  unresolved: string | null;
}
export interface Course {
  code: string;
  name: string;
  credits: number;
  category: CourseCategory;
  tracks: StudyTrack[];
  grading: "numeric" | "su" | "unknown";
  specific: boolean;
  prerequisite: Prerequisite;
  requiresConsent: boolean;
  source: string;
}
export interface Offering extends Term {
  courseCode: string;
  availability: "open" | "closed" | "unknown";
  confidence: "confirmed" | "planned";
  source: string;
}
export interface GroupRule {
  category: CourseCategory;
  minimum: number;
  track: StudyTrack | "both";
  source: string;
}
export interface AcademicPolicy {
  electiveAllocation?: "specific_then_free_earliest_pass" | "unconfirmed";
  starGradeCourses?: string[];
  gpaComparison?: "raw" | "unconfirmed";
  specificGpaBasis?: "all_specific" | "unconfirmed";
  retakeCeiling: number | null;
  degreeCredits: number;
  gpaMinimum: number;
  repeat: "latest_numeric" | "all_attempts" | "unconfirmed";
  rounding: "half_up_2" | "unconfirmed";
  prerequisitePass: "any_pass" | "latest_assessed" | "unconfirmed";
  normalMax: number;
  normalMin: number | null;
  summerMax: number;
  source: string;
}
export interface Dataset {
  id: string;
  curriculumVersionId: string;
  version: number;
  editVersion: number;
  status: "draft" | "published";
  source: string;
  courses: Course[];
  groups: GroupRule[];
  offerings: Offering[];
  policy: AcademicPolicy;
  unresolved: string[];
}
export const CATEGORY_NAMES: Record<CourseCategory, string> = {
  general_required: "ศึกษาทั่วไปบังคับ",
  general_elective: "ศึกษาทั่วไปเลือก",
  core_required: "วิชาแกน",
  specific_required: "เฉพาะด้านบังคับ",
  track_required: "บังคับตามสาย",
  specific_elective: "เฉพาะด้านเลือก",
  free_elective: "เลือกเสรี",
  non_degree: "เสริมพื้นฐานไม่นับจบ",
  unmapped: "ยังไม่จัดหมวด",
};
export const TRACK_NAMES: Record<StudyTrack, string> = {
  project: "โครงงานวิจัย",
  cooperative: "สหกิจศึกษา",
};
