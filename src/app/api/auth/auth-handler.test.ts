import { beforeEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  handler: vi.fn(),
  isGoogleReady: vi.fn(),
  getAuth: vi.fn(),
}));
vi.mock("@/server/auth", () => ({
  getAuth: auth.getAuth,
  isGoogleReady: auth.isGoogleReady,
}));
import { GET, POST } from "./[...all]/route";

beforeEach(() => {
  vi.clearAllMocks();
  auth.isGoogleReady.mockReturnValue(true);
  auth.getAuth.mockReturnValue({ handler: auth.handler });
});

it("does not echo upstream auth server error details", async () => {
  auth.handler.mockResolvedValue(
    Response.json(
      { message: "internal-private-connection-detail" },
      { status: 500 },
    ),
  );
  const response = await GET(
    new Request("http://localhost:3000/api/auth/get-session"),
  );
  expect(response.status).toBe(503);
  const body = await response.json();
  expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
  expect(body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(JSON.stringify(body)).not.toContain(
    "internal-private-connection-detail",
  );
});

it("unconfigured Google fails without constructing an auth/database client", async () => {
  auth.isGoogleReady.mockReturnValue(false);
  const response = await POST(
    new Request("http://localhost:3000/api/auth/sign-in/social", {
      method: "POST",
      body: "{}",
    }),
  );
  expect(response.status).toBe(503);
  expect((await response.json()).error.code).toBe("GOOGLE_NOT_CONFIGURED");
  expect(auth.getAuth).not.toHaveBeenCalled();
});

it("does not allow client scopes or ID-token mode to expand Google login", async () => {
  for (const extra of [
    { scopes: ["https://www.googleapis.com/auth/drive"] },
    { idToken: { token: "untrusted-test-token" } },
  ]) {
    const response = await POST(
      new Request("http://localhost:3000/api/auth/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          callbackURL: "/account",
          ...extra,
        }),
      }),
    );
    expect(response.status).toBe(400);
  }
  expect(auth.getAuth).not.toHaveBeenCalled();
});

it("supported Google code flow delegates origin and redirects to Better Auth", async () => {
  auth.handler.mockResolvedValue(
    Response.json({ url: "https://accounts.google.com/" }),
  );
  const response = await POST(
    new Request("http://localhost:3000/api/auth/sign-in/social", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider: "google",
        callbackURL: "/account",
        errorCallbackURL: "/sign-in",
      }),
    }),
  );
  expect(response.status).toBe(200);
  const delegated = auth.handler.mock.calls[0][0] as Request;
  expect(delegated.headers.get("origin")).toBe("http://localhost:3000");
  expect(await delegated.json()).toEqual({
    provider: "google",
    callbackURL: "/account",
    errorCallbackURL: "/sign-in",
  });
});
