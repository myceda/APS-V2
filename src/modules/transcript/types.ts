import type { StudyTrack } from "@/modules/curriculum/types";
export interface HeaderField {
  value: string | null;
  state: "present" | "not_present" | "unreadable";
  sourcePage: number;
  raw?: string;
}
export interface TranscriptHeader {
  studentCode: HeaderField;
  studentName: HeaderField;
  faculty: HeaderField;
  department: HeaderField;
  degree: HeaderField;
  program: HeaderField;
  campus?: HeaderField;
  studentStatus?: HeaderField;
  track: StudyTrack | null;
  trackState: "selected" | "not_selected" | "unknown";
}
export interface Attempt {
  ordinal: number;
  courseCode: string;
  name: string;
  credits: number | null;
  grade: string | null;
  gradePoints: number | null;
  year: number | null;
  semester: number | null;
  kind: "semester" | "transfer" | "unknown";
  sourcePage: number;
}
export interface ReportedSummary {
  sourcePage: number;
  year: number | null;
  semester: number | null;
  kind: "semester" | "cumulative" | "latest_semester" | "latest_cumulative";
  fields: Record<string, string>;
}
export interface TranscriptIssue {
  code: string;
  message: string;
  severity: "blocking" | "warning";
  ordinal?: number;
  field?: string;
  sourcePage: number;
}
export interface TranscriptPayload {
  header: TranscriptHeader;
  attempts: Attempt[];
  summaries: ReportedSummary[];
  pages: number;
}
export interface DraftView extends TranscriptPayload {
  id: string;
  documentId: string;
  baseRevisionId: string | null;
  editVersion: number;
  status: string;
  issues: TranscriptIssue[];
}
export const GRADES = [
  "A",
  "B+",
  "B",
  "C+",
  "C",
  "D+",
  "D",
  "F",
  "S",
  "U",
  "S*",
  "U*",
  "W",
  "I",
  "R",
  "T",
  "X",
  "Au",
] as const;
