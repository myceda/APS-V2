import { expect, it } from "vitest";
import { loginErrorMessage } from "./login-errors";
it("explains mismatch, permissions and expired flows without echoing unknown details", () => {
  expect(loginErrorMessage()).toBeNull();
  expect(loginErrorMessage("GOOGLE_ACCOUNT_MISMATCH")).toContain("อีเมลหลัก");
  expect(loginErrorMessage("ACCOUNT_NOT_ALLOWED")).toContain("@silpakorn.edu");
  expect(loginErrorMessage("state_mismatch")).toContain("หมดอายุ");
  expect(loginErrorMessage("unable_to_get_user_info")).toContain("รับข้อมูลบัญชีจาก Google ไม่สำเร็จ");
  expect(loginErrorMessage("unable_to_get_user_info")).toContain("อีกครั้ง");
  expect(loginErrorMessage("private-upstream-detail")).not.toContain("private-upstream-detail");
});
