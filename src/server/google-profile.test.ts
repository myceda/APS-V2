import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let verifiedGoogleProfile: typeof import("./google-profile").verifiedGoogleProfile;
beforeEach(async () => {
  vi.resetModules();
  ({ verifiedGoogleProfile } = await import("./google-profile"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = {
  ...key.publicKey.export({ format: "jwk" }),
  kid: "fixture-key",
  alg: "RS256",
  use: "sig",
};
function jwt(overrides: Record<string, unknown> = {}, useOtherKey = false, headerOverrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", kid: "fixture-key", ...headerOverrides }),
  ).toString("base64url");
  const body = Buffer.from(
    JSON.stringify({
      iss: "https://accounts.google.com",
      aud: "fixture-client",
      sub: "fixture-sub",
      email: "synthetic@silpakorn.edu",
      email_verified: true,
      hd: "silpakorn.edu",
      iat: now,
      exp: now + 300,
      ...overrides,
    }),
  ).toString("base64url");
  const signingKey = useOtherKey
    ? generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey
    : key.privateKey;
  return `${header}.${body}.${sign("RSA-SHA256", Buffer.from(`${header}.${body}`), signingKey).toString("base64url")}`;
}
function setup() {
  vi.stubEnv("GOOGLE_CLIENT_ID", "fixture-client");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ keys: [jwk] })),
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("signed Google claims", () => {
  it("accepts a valid signed token and maps hosted domain", async () => {
    setup();
    expect(await verifiedGoogleProfile({ idToken: jwt() })).toMatchObject({
      user: { emailVerified: true, googleHostedDomain: "silpakorn.edu" },
      data: { sub: "fixture-sub" },
    });
  });
  it.each([
    { aud: "wrong-client" },
    { iss: "https://evil.test" },
    { exp: 1 },
    { iat: 1 },
    { email_verified: false },
    { sub: "" },
  ])("rejects invalid claims %j", async (overrides) => {
    setup();
    expect(await verifiedGoogleProfile({ idToken: jwt(overrides) })).toBeNull();
  });
  it("rejects a signature from another key", async () => {
    setup();
    expect(await verifiedGoogleProfile({ idToken: jwt({}, true) })).toBeNull();
  });
  it.each(["iat", "nbf"])("accepts a signed token with %s up to 30 seconds ahead", async (claim) => {
    setup();
    const now = Math.floor(Date.now() / 1000);
    expect(await verifiedGoogleProfile({ idToken: jwt({ [claim]: now + 30 }) })).not.toBeNull();
  });
  it.each(["iat", "nbf"])("rejects a signed token with %s beyond clock tolerance", async (claim) => {
    setup();
    const now = Math.floor(Date.now() / 1000);
    expect(await verifiedGoogleProfile({ idToken: jwt({ [claim]: now + 60 }) })).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('"code":"TOKEN_TIME_INVALID"'));
  });
  it("rejects a token expired beyond clock tolerance", async () => {
    setup();
    const now = Math.floor(Date.now() / 1000);
    expect(await verifiedGoogleProfile({ idToken: jwt({ exp: now - 60 }) })).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('"code":"TOKEN_EXPIRED"'));
  });
  it("rejects mismatched nonce and missing token", async () => {
    setup();
    expect(
      await verifiedGoogleProfile({
        idToken: jwt({ nonce: "other" }),
        expectedIdTokenNonce: "expected",
      }),
    ).toBeNull();
    expect(await verifiedGoogleProfile({})).toBeNull();
  });

  it.each([
    [{ sub: undefined }, "PROFILE_SUBJECT_MISSING"],
    [{ email: undefined }, "PROFILE_EMAIL_MISSING"],
    [{ email: "" }, "PROFILE_EMAIL_MISSING"],
    [{ email_verified: false }, "PROFILE_EMAIL_UNVERIFIED"],
    [{ exp: undefined }, "PROFILE_CLAIMS_INCOMPLETE"],
    [{ aud: "wrong-client" }, "TOKEN_AUDIENCE_INVALID"],
    [{ iss: "https://evil.test" }, "TOKEN_ISSUER_INVALID"],
    [{ exp: 1 }, "TOKEN_EXPIRED"],
  ])("records a safe reason for rejected signed claims %j", async (claims, code) => {
    setup();
    expect(await verifiedGoogleProfile({ idToken: jwt(claims) })).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(`"code":"${code}"`));
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("synthetic@");
  });

  it.each([
    ["network", "KEYS_NETWORK_FAILED"],
    ["timeout", "KEYS_TIMEOUT"],
    ["http", "KEYS_HTTP_FAILED"],
    ["invalid-json", "KEYS_INVALID"],
  ])("rejects unavailable public keys (%s) without exposing upstream data", async (failure, code) => {
    setup();
    const secret = "private-provider-response-and-token";
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (failure === "http") return new Response(secret, { status: 503 });
      if (failure === "invalid-json") return new Response(secret, { status: 200 });
      if (failure === "timeout") throw new DOMException(secret, "TimeoutError");
      throw new TypeError(secret);
    }));
    const idToken = jwt();
    expect(await verifiedGoogleProfile({ idToken })).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(JSON.stringify({
      event: "auth_request_issue", stage: "google_keys", code,
    }));
    const logged = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain(idToken);
    expect(logged).not.toContain("synthetic@");
  });

  it("recovers after key fetch failure and reuses only verified public keys", async () => {
    setup();
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"));
    expect(await verifiedGoogleProfile({ idToken: jwt() })).toBeNull();
    expect(await verifiedGoogleProfile({ idToken: jwt() })).not.toBeNull();
    expect(await verifiedGoogleProfile({ idToken: jwt() })).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await verifiedGoogleProfile({ idToken: jwt({}, true) })).toBeNull();
    expect(console.warn).toHaveBeenLastCalledWith(JSON.stringify({
      event: "auth_request_issue", stage: "google_token", code: "TOKEN_SIGNATURE_INVALID",
    }));
  });

  it.each(["HS256", "none"])("never accepts %s in place of RS256", async (alg) => {
    setup();
    expect(await verifiedGoogleProfile({ idToken: jwt({}, false, { alg }) })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
