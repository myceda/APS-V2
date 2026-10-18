import { describe, expect, it } from "vitest";
import {
  requireStudent,
  requireOwner,
  requireAccountManager,
  requireCurriculumAdmin,
  requireVerifiedGoogleEmail,
} from "./guards";
import type { AccountContext } from "./types";
import { parseAccountInput } from "./validation";

const context: AccountContext = {
  email: "student@example.test",
  onboardingStatus: "complete",
  authUserId: "auth-a",
  accountId: "account-a",
  displayName: "ทดสอบ",
  role: "student",
  canManageAccounts: false,
  curriculumIds: [],
  enrollment: {
    id: "enrollment-a",
    studentCode: "00123",
    curriculumId: "cs",
    curriculumCode: "CS2565",
    curriculumVersionId: "version",
    curriculumState: "draft",
    trackState: "unknown",
    trackId: null,
    trackName: null,
  },
};
const studentInput = {
  email: " Student@Example.test ",
  role: "student",
  status: "active",
  curriculumIds: [],
  studentCode: "00123",
  curriculumVersionId: "11111111-1111-4111-8111-111111111111",
  trackState: "unknown",
  trackId: null,
};

describe("server-owned identity and permission policies", () => {
  it("keeps unknown track and leading zero student identity", () => {
    expect(requireStudent(context)).toMatchObject({
      studentCode: "00123",
      trackState: "unknown",
      trackId: null,
    });
  });
  it("does not give student rights to an administrator", () => {
    expect(() => requireStudent({ ...context, role: "admin" })).toThrow(
      "ไม่มีสิทธิ์นักศึกษา",
    );
  });
  it("requires an enrollment for student data", () => {
    expect(() => requireStudent({ ...context, enrollment: null })).toThrow(
      expect.objectContaining({ code: "ENROLLMENT_REQUIRED", status: 403 }),
    );
  });
  it("does not expose another account's resource", () => {
    expect(() => requireOwner(context, "account-b")).toThrow("ไม่พบข้อมูล");
    expect(() => requireOwner(context, "account-a")).not.toThrow();
  });
  it("curriculum assignment does not grant account management", () => {
    const admin = { ...context, role: "admin" as const, curriculumIds: ["cs"] };
    expect(() => requireAccountManager(admin)).toThrow("ผู้ดูแลหลัก");
    expect(() => requireCurriculumAdmin(admin, "cs")).not.toThrow();
    expect(() => requireCurriculumAdmin(admin, "other")).toThrow("ไม่มีสิทธิ์");
  });
  it("manager flag alone does not grant curriculum access", () => {
    expect(() =>
      requireCurriculumAdmin(
        { ...context, role: "admin", canManageAccounts: true },
        "cs",
      ),
    ).toThrow("ไม่มีสิทธิ์");
  });
  it("manager permission also requires admin role", () => {
    expect(() =>
      requireAccountManager({ ...context, canManageAccounts: true }),
    ).toThrow();
  });
  it("rejects unverified Google identities", () => {
    expect(() => requireVerifiedGoogleEmail("a@example.test", false)).toThrow(
      "ยังไม่ยืนยัน",
    );
  });
});

describe("account input boundary", () => {
  it("normalizes email without changing identity semantics", () => {
    expect(parseAccountInput(studentInput)).toMatchObject({
      email: "student@example.test",
      studentCode: "00123",
      trackState: "unknown",
    });
  });
  it.each(["canManageAccounts", "authUserId", "student_id", "accountId"])(
    "rejects injected %s",
    (key) => {
      expect(() =>
        parseAccountInput({ ...studentInput, [key]: "forged" }),
      ).toThrow("ฟิลด์");
    },
  );
  it("rejects unknown role instead of defaulting to admin", () => {
    expect(() => parseAccountInput({ ...studentInput, role: "root" })).toThrow(
      "บทบาท",
    );
  });
  it("requires a version before updating", () => {
    expect(() => parseAccountInput(studentInput, true)).toThrow("ฉบับข้อมูล");
  });
  it("does not silently convert unknown to selected", () => {
    expect(() =>
      parseAccountInput({
        ...studentInput,
        trackId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toThrow("ต้องไม่มีรหัสสาย");
  });
  it("rejects granting curriculum admin privileges to a student", () => {
    expect(() =>
      parseAccountInput({
        ...studentInput,
        curriculumIds: ["11111111-1111-4111-8111-111111111111"],
      }),
    ).toThrow("ไม่รับสิทธิ์");
  });
});
