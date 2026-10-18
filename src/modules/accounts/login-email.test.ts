import { describe, expect, it } from "vitest";
import { parseLoginEmail, requireMatchingLoginEmail } from "./login-email";
describe("requested Google account", () => {
  it("normalizes a requested email and permits older calls without a hint", () => {
    expect(parseLoginEmail(" Student@Silpakorn.edu ")).toBe(
      "student@silpakorn.edu",
    );
    expect(parseLoginEmail(undefined)).toBeUndefined();
    expect(() =>
      requireMatchingLoginEmail(undefined, "student@silpakorn.edu"),
    ).not.toThrow();
  });
  it.each([
    null,
    {},
    1,
    "",
    "not-an-email",
    "x@fake@silpakorn.edu",
    "a".repeat(260) + "@silpakorn.edu",
  ])("rejects malformed hint %j", (value) => {
    expect(() => parseLoginEmail(value)).toThrow();
  });
  it("requires the signed Google email to match, without changing either account", () => {
    expect(() =>
      requireMatchingLoginEmail(
        "Student@silpakorn.edu",
        "student@silpakorn.edu",
      ),
    ).not.toThrow();
    expect(() =>
      requireMatchingLoginEmail("new@silpakorn.edu", "old@silpakorn.edu"),
    ).toThrow("Google ยืนยันบัญชีอื่น");
  });
});
