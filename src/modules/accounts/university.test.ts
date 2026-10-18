import { describe, expect, it } from "vitest";
import { isUniversityIdentity } from "./university";
describe("Google university membership", () => {
  it("accepts exact domain with verified hosted domain", () => {
    expect(
      isUniversityIdentity(" Student@Silpakorn.edu ", "silpakorn.edu"),
    ).toBe(true);
  });
  it.each([
    ["student@silpakorn.edu", undefined],
    ["student@silpakorn.edu", "other.edu"],
    ["student@silpakorn.edu.evil.test", "silpakorn.edu"],
    ["student@sub.silpakorn.edu", "silpakorn.edu"],
    ["student@gmail.com", "silpakorn.edu"],
    ["x@fake@silpakorn.edu", "silpakorn.edu"],
  ])("rejects %s with hd %s", (email, hd) => {
    expect(isUniversityIdentity(email as string, hd)).toBe(false);
  });
});
