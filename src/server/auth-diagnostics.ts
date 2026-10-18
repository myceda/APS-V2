import "server-only";

// Only fixed codes cross the logging boundary. Never serialize provider errors,
// JWT payloads, request URLs, or Better Auth's extra arguments.
const callbackIssues = {
  "": "TOKEN_EXCHANGE_FAILED",
  INVALID_CALLBACK_REQUEST: "INVALID_CALLBACK_REQUEST",
  "State not found": "STATE_NOT_FOUND",
  "Unable to get user info": "PROFILE_UNAVAILABLE",
  "Unable to derive provider account identity": "ACCOUNT_SUBJECT_INVALID",
  "Unable to create OAuth user": "USER_CREATE_FAILED",
  unable_to_create_user: "USER_CREATE_FAILED",
  unable_to_create_session: "SESSION_CREATE_FAILED",
  "Unable to run validateUserInfo: missing endpoint context": "VALIDATION_CONTEXT_MISSING",
  "validateUserInfo callback threw": "IDENTITY_CHECK_FAILED",
} as const;

type AuthIssueCode = (typeof callbackIssues)[keyof typeof callbackIssues]
  | "AUTH_CALLBACK_FAILED" | "CLIENT_ID_MISSING" | "ID_TOKEN_MISSING"
  | "KEYS_NETWORK_FAILED" | "KEYS_TIMEOUT" | "KEYS_HTTP_FAILED"
  | "KEYS_INVALID" | "SIGNING_KEY_NOT_FOUND" | "TOKEN_EXPIRED"
  | "TOKEN_SIGNATURE_INVALID" | "TOKEN_AUDIENCE_INVALID" | "TOKEN_ISSUER_INVALID"
  | "TOKEN_TIME_INVALID" | "TOKEN_CLAIMS_INVALID" | "TOKEN_INVALID"
  | "TOKEN_NONCE_INVALID" | "PROFILE_SUBJECT_MISSING" | "PROFILE_EMAIL_MISSING"
  | "PROFILE_EMAIL_UNVERIFIED" | "PROFILE_CLAIMS_INCOMPLETE";

export function logAuthIssue(
  stage: "configuration" | "google_keys" | "google_token" | "google_profile" | "callback",
  code: AuthIssueCode,
) {
  console.warn(JSON.stringify({ event: "auth_request_issue", stage, code }));
}

export function logBetterAuthIssue(_level: string, message: string) {
  logAuthIssue(
    "callback",
    Object.hasOwn(callbackIssues, message)
      ? callbackIssues[message as keyof typeof callbackIssues]
      : "AUTH_CALLBACK_FAILED",
  );
}
