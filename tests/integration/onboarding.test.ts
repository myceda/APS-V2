import { randomUUID, generateKeyPairSync, sign } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createIdentity, createSessionFixture } from "../support/fixtures";
import { getDatabase } from "@/server/database";
import {
  validateGoogleIdentity,
  bindAccountToUser,
} from "@/server/account-binding";
import { requireAccount } from "@/server/account-context";
import { requireStudent } from "@/modules/accounts/guards";
import { updateAccount } from "@/server/accounts";
import {
  saveEnrollmentRequest,
  reviewEnrollmentRequest,
  getOwnEnrollmentRequest,
} from "@/server/enrollment-requests";
import { GET, PUT } from "@/app/api/me/enrollment-request/route";
import { GET as list } from "@/app/api/admin/enrollment-requests/route";
import { POST as review } from "@/app/api/admin/enrollment-requests/[id]/review/route";
import {
  POST as authPost,
  GET as authGet,
} from "@/app/api/auth/[...all]/route";
import type { AccountContext } from "@/modules/accounts/types";

const db = getDatabase();
// A provider keeps a stable public key for a given kid across callback requests.
const oauthFixtureKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const accessIds: string[] = [];
const userIds: string[] = [];
let manager: AccountContext;
let managerHeaders: Headers;
let rootSessionId: string;
let versionId: string;
beforeAll(async () => {
  const root = await createIdentity(
    "admin",
    true,
    "fixture-manager@aps-tests.invalid",
  );
  const fixture = await createSessionFixture(root.user.id);
  rootSessionId = fixture.session.id;
  managerHeaders = fixture.headers;
  manager = await requireAccount(managerHeaders);
  versionId = root.version.id;
});
afterAll(async () => {
  await db.session.deleteMany({ where: { id: rootSessionId } });
  await db.enrollmentRequest.deleteMany({
    where: { accountAccessId: { in: accessIds } },
  });
  await db.auditEvent.deleteMany({
    where: { targetAccountId: { in: accessIds } },
  });
  await db.curriculumAdmin.deleteMany({
    where: { accountAccessId: { in: accessIds } },
  });
  await db.studentEnrollment.deleteMany({
    where: { accountAccessId: { in: accessIds } },
  });
  await db.accountAccess.deleteMany({ where: { id: { in: accessIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});
async function pending() {
  const identity = await createIdentity("student");
  accessIds.push(identity.access.id);
  userIds.push(identity.user.id);
  await db.studentEnrollment.delete({
    where: { accountAccessId: identity.access.id },
  });
  const fixture = await createSessionFixture(identity.user.id);
  return {
    ...identity,
    fixture,
    context: await requireAccount(fixture.headers),
  };
}
function input(
  expectedVersion = 0,
  studentCode = `00${randomUUID().slice(0, 20)}`,
) {
  return {
    expectedVersion,
    studentCode,
    curriculumVersionId: versionId,
    trackState: "unknown",
    trackId: null,
  };
}
function req(path: string, headers: Headers, method = "GET", body?: unknown) {
  const h = new Headers(headers);
  if (method !== "GET") {
    h.set("origin", "http://localhost:3101");
    h.set("content-type", "application/json");
  }
  return new Request(`http://localhost:3101${path}`, {
    headers: h,
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
describe("University registration and confirmed enrollment", () => {
  it.each([
    { allowed: true, matches: true },
    { allowed: false, matches: true },
    { allowed: true, matches: false },
  ])(
    "OAuth handler checks university domain and requested identity: %j",
    async ({ allowed, matches }) => {
      const email = `oauth-${randomUUID()}@silpakorn.edu`;
      const requested = matches
        ? email
        : `requested-${randomUUID()}@silpakorn.edu`;
      const old = await createIdentity("student");
      accessIds.push(old.access.id);
      userIds.push(old.user.id);
      const oldSession = await createSessionFixture(old.user.id);
      const start = await authPost(
        req("/api/auth/sign-in/social", oldSession.headers, "POST", {
          provider: "google",
          callbackURL: "http://localhost:3101/account",
          loginHint: requested.toUpperCase(),
        }),
      );
      expect(start.status).toBe(200);
      const authorization = new URL((await start.json()).url);
      expect(authorization.searchParams.get("login_hint")).toBe(requested);
      expect(
        authorization.searchParams.get("scope")?.split(" ").sort(),
      ).toEqual(["email", "openid", "profile"]);
      const cookies = start.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
      const key = oauthFixtureKey;
      const now = Math.floor(Date.now() / 1000);
      const head = Buffer.from(
        JSON.stringify({ alg: "RS256", kid: "oauth-fixture" }),
      ).toString("base64url");
      const body = Buffer.from(
        JSON.stringify({
          iss: "https://accounts.google.com",
          aud: "fixture-client",
          sub: `fixture:${email}`,
          email,
          email_verified: true,
          ...(allowed ? { hd: "silpakorn.edu" } : {}),
          name: "Synthetic OAuth fixture",
          iat: now,
          exp: now + 300,
        }),
      ).toString("base64url");
      const token = `${head}.${body}.${sign("RSA-SHA256", Buffer.from(`${head}.${body}`), key.privateKey).toString("base64url")}`;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL | Request) => {
          const address = String(url);
          if (address.includes("oauth2.googleapis.com/token"))
            return Response.json({
              access_token: "fixture-access",
              token_type: "Bearer",
              expires_in: 300,
              id_token: token,
              scope: "openid email profile",
            });
          if (address.includes("googleapis.com/oauth2/v3/certs"))
            return Response.json({
              keys: [
                {
                  ...key.publicKey.export({ format: "jwk" }),
                  kid: "oauth-fixture",
                  alg: "RS256",
                  use: "sig",
                },
              ],
            });
          throw new Error("Unexpected network in mocked OAuth test");
        }),
      );
      try {
        const callback = new URL(
          "http://localhost:3101/api/auth/callback/google",
        );
        callback.searchParams.set(
          "state",
          authorization.searchParams.get("state")!,
        );
        callback.searchParams.set("code", "fixture-code");
        // Tampering with the callback query cannot replace the expected identity
        // saved in the OAuth state by the server.
        callback.searchParams.set("loginHint", email);
        const response = await authGet(
          new Request(callback, {
            headers: {
              cookie: `${cookies}; ${oldSession.headers.get("cookie")}`,
            },
          }),
        );
        const access = await db.accountAccess.findUnique({ where: { email } });
        const user = await db.user.findUnique({ where: { email } });
        if (access) accessIds.push(access.id);
        if (user) userIds.push(user.id);
        if (allowed && matches) {
          expect(response.headers.get("location")).toBe(
            "http://localhost:3101/account",
          );
          expect(access).toMatchObject({
            role: "student",
            canManageAccounts: false,
            authUserId: user?.id,
          });
          expect(user?.googleHostedDomain).toBe("silpakorn.edu");
          const sessionCookies = response.headers
            .getSetCookie()
            .map((c) => c.split(";")[0])
            .join("; ");
          expect(
            await requireAccount(new Headers({ cookie: sessionCookies })),
          ).toMatchObject({
            email,
            accountId: access!.id,
            onboardingStatus: "required",
            enrollment: null,
          });
          expect(access!.id).not.toBe(old.access.id);
          expect(
            (await db.user.findUniqueOrThrow({ where: { id: old.user.id } }))
              .email,
          ).toBe(old.user.email);
          expect(
            (await requireAccount(oldSession.headers)).enrollment,
          ).not.toBeNull();
        } else {
          expect(access).toBeNull();
          expect(user).toBeNull();
          expect(response.headers.get("location")).toContain(
            matches ? "ACCOUNT_NOT_ALLOWED" : "GOOGLE_ACCOUNT_MISMATCH",
          );
          expect(
            (await db.user.findUniqueOrThrow({ where: { id: old.user.id } }))
              .email,
          ).toBe(old.user.email);
        }
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );
  it("validates requested email and rejects caller-supplied OAuth state/privilege data", async () => {
    for (const extra of [
      { loginHint: "not-an-email" },
      { loginHint: { role: "admin" } },
      {
        loginHint: "test@silpakorn.edu",
        additionalData: {
          serverContext: { apsLoginEmail: "other@silpakorn.edu" },
        },
      },
      { loginHint: "test@silpakorn.edu", role: "admin" },
      {
        loginHint: "test@silpakorn.edu",
        scopes: ["https://www.googleapis.com/auth/drive"],
      },
    ]) {
      const response = await authPost(
        req("/api/auth/sign-in/social", new Headers(), "POST", {
          provider: "google",
          callbackURL: "http://localhost:3101/account",
          ...extra,
        }),
      );
      expect(response.status).toBe(400);
    }
  });
  it("does not move a bound Google subject to a new university email", async () => {
    const original = await pending();
    await expect(
      validateGoogleIdentity(
        `other-${randomUUID()}@silpakorn.edu`,
        true,
        `fixture:${original.user.email}`,
        "silpakorn.edu",
      ),
    ).rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: original.user.id } }))
        .email,
    ).toBe(original.user.email);
  });
  it("does not serve confirmed context if auth email differs from its bound account", async () => {
    const original = await createIdentity("student");
    accessIds.push(original.access.id);
    userIds.push(original.user.id);
    const fixture = await createSessionFixture(original.user.id);
    await db.user.update({
      where: { id: original.user.id },
      data: { email: `changed-${randomUUID()}@silpakorn.edu` },
    });
    await expect(requireAccount(fixture.headers)).rejects.toMatchObject({
      code: "IDENTITY_CONFLICT",
    });
    await expect(bindAccountToUser(original.user.id)).rejects.toMatchObject({
      code: "IDENTITY_CONFLICT",
    });
    expect(
      await db.studentEnrollment.count({
        where: { accountAccessId: original.access.id },
      }),
    ).toBe(1);
  });
  it("creates and binds one account atomically without a prior allowlist or enrollment", async () => {
    const email = `auto-${randomUUID()}@silpakorn.edu`;
    expect(
      await validateGoogleIdentity(email, true, "subject", "silpakorn.edu"),
    ).toBeNull();
    expect(await db.accountAccess.findUnique({ where: { email } })).toBeNull();
    const user = await db.user.create({
      data: {
        email,
        name: "Synthetic university fixture",
        emailVerified: true,
        googleHostedDomain: "silpakorn.edu",
        accounts: {
          create: { providerId: "google", accountId: `fixture:${email}` },
        },
      },
    });
    userIds.push(user.id);
    const results = await Promise.all([
      bindAccountToUser(user.id),
      bindAccountToUser(user.id),
    ]);
    accessIds.push(results[0].id);
    expect(results[1].id).toBe(results[0].id);
    expect(results[0]).toMatchObject({
      role: "student",
      canManageAccounts: false,
      authUserId: user.id,
    });
    expect(
      await db.auditEvent.count({
        where: {
          targetAccountId: results[0].id,
          action: "university_registration",
        },
      }),
    ).toBe(1);
    const fixture = await createSessionFixture(user.id);
    const context = await requireAccount(fixture.headers);
    expect(context).toMatchObject({
      onboardingStatus: "required",
      enrollment: null,
      curriculumIds: [],
    });
    expect(() => requireStudent(context)).toThrow(expect.objectContaining({code:"ENROLLMENT_REQUIRED",status:403}));
  });
  it("rejects unverified/missing/wrong hd and lookalike domains", async () => {
    for (const [email, verified, hd] of [
      [`a-${randomUUID()}@silpakorn.edu`, false, "silpakorn.edu"],
      [`a-${randomUUID()}@silpakorn.edu`, true, undefined],
      [`a-${randomUUID()}@silpakorn.edu`, true, "other.edu"],
      [`a-${randomUUID()}@silpakorn.edu.evil.test`, true, "silpakorn.edu"],
    ] as const)
      await expect(
        validateGoogleIdentity(email, verified, "sub", hd),
      ).rejects.toBeDefined();
  });
  it("keeps external administrators and never reactivates suspended university accounts", async () => {
    expect(
      await validateGoogleIdentity(
        "fixture-manager@aps-tests.invalid",
        true,
        "fixture:fixture-manager@aps-tests.invalid",
      ),
    ).toMatchObject({ role: "admin" });
    const email = `inactive-${randomUUID()}@silpakorn.edu`;
    const account = await db.accountAccess.create({
      data: { email, role: "student", status: "inactive" },
    });
    accessIds.push(account.id);
    await expect(
      validateGoogleIdentity(email, true, "sub", "silpakorn.edu"),
    ).rejects.toMatchObject({ code: "ACCOUNT_NOT_ALLOWED" });
    expect(await db.accountAccess.count({ where: { email } })).toBe(1);
  });
  it("blocks academic guard until approval and revokes the old session", async () => {
    const student = await pending();
    const row = await saveEnrollmentRequest(student.context, input());
    expect(await requireAccount(student.fixture.headers)).toMatchObject({
      onboardingStatus: "pending",
      enrollment: null,
    });
    expect(
      (
        await reviewEnrollmentRequest(manager, row.id, {
          decision: "approved",
          expectedVersion: row.version,
        })
      ).status,
    ).toBe("approved");
    await expect(requireAccount(student.fixture.headers)).rejects.toMatchObject(
      { status: 401 },
    );
    const fresh = await createSessionFixture(student.user.id);
    const context = await requireAccount(fresh.headers);
    expect(context.onboardingStatus).toBe("complete");
    expect(requireStudent(context).studentCode).toBe(row.studentCode);
    await expect(saveEnrollmentRequest(context, input())).rejects.toMatchObject(
      { code: "ENROLLMENT_COMPLETE" },
    );
  });
  it("resubmits a rejection without overwriting reviewed history", async () => {
    const student = await pending();
    const row = await saveEnrollmentRequest(student.context, input());
    const rejected = await reviewEnrollmentRequest(manager, row.id, {
      decision: "rejected",
      reason: "ตรวจหลักสูตรอีกครั้ง",
      expectedVersion: row.version,
    });
    expect(await requireAccount(student.fixture.headers)).toMatchObject({
      onboardingStatus: "rejected",
    });
    const next = await saveEnrollmentRequest(
      student.context,
      input(rejected.version),
    );
    expect(next.id).not.toBe(row.id);
    expect(next.version).toBeGreaterThan(rejected.version);
    expect(
      await db.enrollmentRequest.findUnique({ where: { id: row.id } }),
    ).toMatchObject({
      status: "rejected",
      reviewReason: "ตรวจหลักสูตรอีกครั้ง",
    });
  });
  it("serializes concurrent submissions and detects stale edits", async () => {
    const student = await pending();
    const results = await Promise.allSettled([
      saveEnrollmentRequest(student.context, input()),
      saveEnrollmentRequest(student.context, input()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const row = await getOwnEnrollmentRequest(student.context);
    const next = await saveEnrollmentRequest(
      student.context,
      input(row!.version),
    );
    await expect(
      saveEnrollmentRequest(student.context, input(row!.version)),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(next.id).toBe(row!.id);
  });
  it("approval retries are idempotent and conflicting decisions are rejected", async () => {
    const student = await pending();
    const row = await saveEnrollmentRequest(student.context, input());
    const action = { decision: "approved", expectedVersion: row.version };
    const results = await Promise.all([
      reviewEnrollmentRequest(manager, row.id, action),
      reviewEnrollmentRequest(manager, row.id, action),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(
      await db.studentEnrollment.count({
        where: { accountAccessId: student.access.id },
      }),
    ).toBe(1);
    expect(
      await db.auditEvent.count({
        where: {
          targetAccountId: student.access.id,
          action: "enrollment_approved",
        },
      }),
    ).toBe(1);
    await expect(
      reviewEnrollmentRequest(manager, row.id, {
        decision: "rejected",
        reason: "different",
        expectedVersion: row.version,
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });
  it("duplicate student code rolls back approval and preserves its owner and sessions", async () => {
    const first = await pending();
    const second = await pending();
    const code = input().studentCode;
    const a = await saveEnrollmentRequest(first.context, input(0, code));
    const b = await saveEnrollmentRequest(second.context, input(0, code));
    await reviewEnrollmentRequest(manager, a.id, {
      decision: "approved",
      expectedVersion: a.version,
    });
    await expect(
      reviewEnrollmentRequest(manager, b.id, {
        decision: "approved",
        expectedVersion: b.version,
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(
      await db.enrollmentRequest.findUnique({ where: { id: b.id } }),
    ).toMatchObject({ status: "pending", version: b.version });
    expect(await requireAccount(second.fixture.headers)).toMatchObject({
      enrollment: null,
    });
    expect(
      await db.studentEnrollment.findUnique({
        where: {
          curriculumVersionId_studentCode: {
            curriculumVersionId: versionId,
            studentCode: code,
          },
        },
      }),
    ).toMatchObject({ accountAccessId: first.access.id });
  });
  it("own API isolates identity and rejects privilege input and foreign origins", async () => {
    const a = await pending();
    const b = await pending();
    const row = await saveEnrollmentRequest(a.context, input());
    expect(
      (
        await (
          await GET(
            req(
              `/api/me/enrollment-request?accountId=${a.access.id}`,
              b.fixture.headers,
            ),
          )
        ).json()
      ).request,
    ).toBeNull();
    expect(
      (await GET(req(`/api/me/enrollment-request`, a.fixture.headers))).status,
    ).toBe(200);
    expect(
      (
        await PUT(
          req("/api/me/enrollment-request", b.fixture.headers, "PUT", {
            ...input(),
            accountAccessId: a.access.id,
            role: "admin",
          }),
        )
      ).status,
    ).toBe(400);
    const forged = req(
      "/api/me/enrollment-request",
      b.fixture.headers,
      "PUT",
      input(),
    );
    forged.headers.set("origin", "https://evil.test");
    expect((await PUT(forged)).status).toBe(403);
    expect(
      (
        await review(
          req(
            "/api/admin/enrollment-requests/x/review",
            b.fixture.headers,
            "POST",
            { decision: "approved", expectedVersion: row.version },
          ),
          { params: Promise.resolve({ id: row.id }) },
        )
      ).status,
    ).toBe(403);
    expect(
      (await list(req("/api/admin/enrollment-requests", b.fixture.headers)))
        .status,
    ).toBe(403);
  });
  it("curriculum administrators cannot review and anonymous callers get 401", async () => {
    const admin = await createIdentity("admin");
    accessIds.push(admin.access.id);
    userIds.push(admin.user.id);
    const fixture = await createSessionFixture(admin.user.id);
    expect(
      (await list(req("/api/admin/enrollment-requests", fixture.headers)))
        .status,
    ).toBe(403);
    expect(
      (await GET(req("/api/me/enrollment-request", new Headers()))).status,
    ).toBe(401);
    expect(
      (await list(req("/api/admin/enrollment-requests", managerHeaders)))
        .status,
    ).toBe(200);
  });
  it("rejects unsupported references and requires rejection reasons", async () => {
    const student = await pending();
    await expect(
      saveEnrollmentRequest(student.context, {
        ...input(),
        curriculumVersionId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      saveEnrollmentRequest(student.context, {
        ...input(),
        trackState: "selected",
        trackId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 400 });
    const row = await saveEnrollmentRequest(student.context, input());
    await expect(
      reviewEnrollmentRequest(manager, row.id, {
        decision: "rejected",
        expectedVersion: row.version,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("suspends a bound account without enrollment through the manager form", async () => {
    const student = await pending();
    const latest = await db.accountAccess.findUniqueOrThrow({
      where: { id: student.access.id },
    });
    await updateAccount(manager, latest.id, {
      email: latest.email,
      role: "student",
      status: "inactive",
      curriculumIds: [],
      studentCode: null,
      curriculumVersionId: null,
      trackState: "unknown",
      trackId: null,
      expectedVersion: latest.version,
    });
    await expect(requireAccount(student.fixture.headers)).rejects.toMatchObject(
      { status: 401 },
    );
    await expect(createSessionFixture(student.user.id)).rejects.toBeDefined();
  });
});
