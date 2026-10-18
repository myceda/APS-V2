export type Role = "student" | "admin";
export type Status = "active" | "inactive";
export type TrackState = "selected" | "not_selected" | "unknown";

export interface EnrollmentContext {
  id: string;
  studentCode: string;
  curriculumId: string;
  curriculumCode: string;
  curriculumVersionId: string;
  curriculumState: string;
  confirmationSource?: string;
  trackState: TrackState;
  trackId: string | null;
  trackName: string | null;
}

export interface AccountContext {
  email: string;
  authUserId: string;
  accountId: string;
  displayName: string;
  role: Role;
  canManageAccounts: boolean;
  curriculumIds: string[];
  enrollment: EnrollmentContext | null;
  onboardingStatus: "required" | "pending" | "rejected" | "complete";
}

export interface EnrollmentRequestSummary {
  id: string;
  accountAccessId: string;
  email: string;
  studentCode: string;
  curriculumVersionId: string;
  curriculumCode: string;
  trackState: TrackState;
  trackId: string | null;
  trackName: string | null;
  status: "pending" | "approved" | "rejected";
  version: number;
  reviewReason: string | null;
  submissionReason?: string | null;
}

export interface AccountInput {
  email: string;
  role: Role;
  status: Status;
  curriculumIds: string[];
  studentCode: string | null;
  curriculumVersionId: string | null;
  trackState: TrackState;
  trackId: string | null;
  expectedVersion?: number;
}

export interface AccountSummary {
  id: string;
  email: string;
  role: Role;
  status: Status;
  canManageAccounts: boolean;
  bound: boolean;
  version: number;
  curriculumIds: string[];
  enrollment: {
    confirmationSource?: string;
    studentCode: string;
    curriculumVersionId: string;
    trackState: TrackState;
    trackId: string | null;
  } | null;
}

export interface CurriculumOption {
  id: string;
  code: string;
  name: string;
  versions: {
    id: string;
    code: string;
    state: string;
    tracks: { id: string; code: string; name: string }[];
  }[];
}
