import { getAuth, isGoogleReady } from "@/server/auth";
import { AccessError } from "@/modules/accounts/errors";
import { errorResponse, readJson } from "@/server/http";
import { invalidInput } from "@/modules/accounts/errors";
import { parseLoginEmail } from "@/modules/accounts/login-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  try {
    if (new URL(request.url).pathname.endsWith("/sign-in/social")) {
      if (!isGoogleReady())
        throw new AccessError(
          503,
          "GOOGLE_NOT_CONFIGURED",
          "การเข้าสู่ระบบ Google ยังไม่พร้อม กรุณาติดต่อผู้ดูแล",
        );
      const input = await readJson(request);
      const allowedFields = new Set([
        "provider",
        "callbackURL",
        "errorCallbackURL",
        "newUserCallbackURL",
        "disableRedirect",
        "requestSignUp",
        "loginHint",
      ]);
      if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        (input as Record<string, unknown>).provider !== "google" ||
        Object.keys(input).some((field) => !allowedFields.has(field))
      )
        invalidInput("ใช้การเข้าสู่ระบบ Google แบบที่ระบบรองรับเท่านั้น");
      const body = input as Record<string, unknown>;
      const email = parseLoginEmail(body.loginHint);
      if (email) body.loginHint = email;
      // Do not accept client scopes, ID tokens or provider overrides. Better Auth
      // still validates redirects, CSRF origin/state and OAuth's code flow.
      const headers = new Headers(request.headers);
      headers.delete("content-length");
      request = new Request(request.url, {
        method: request.method,
        headers,
        body: JSON.stringify(input),
      });
    }
    const response = await getAuth().handler(request);
    if (response.status >= 500)
      return errorResponse(new Error("auth_operation_failed"));
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
export const GET = handle;
export const POST = handle;
