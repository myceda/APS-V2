import { afterEach, expect, it, vi } from "vitest";
import { logBetterAuthIssue } from "./auth-diagnostics";

afterEach(() => vi.restoreAllMocks());

it.each([
  ["Unable to get user info", "PROFILE_UNAVAILABLE"],
  ["Unable to derive provider account identity", "ACCOUNT_SUBJECT_INVALID"],
  ["", "TOKEN_EXCHANGE_FAILED"],
  ["unexpected-provider-details secret@example.test token=private", "AUTH_CALLBACK_FAILED"],
  ["__proto__", "AUTH_CALLBACK_FAILED"],
])("logs a fixed callback reason without echoing provider details", (message, code) => {
  const log = vi.spyOn(console, "warn").mockImplementation(() => {});
  logBetterAuthIssue("error", message);
  expect(log).toHaveBeenCalledExactlyOnceWith(JSON.stringify({
    event: "auth_request_issue", stage: "callback", code,
  }));
});
