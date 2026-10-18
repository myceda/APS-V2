import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createIdentity, createSessionFixture } from "../support/fixtures";
import { getDatabase } from "@/server/database";
import { getAuth } from "@/server/auth";
import { requireAccount } from "@/server/account-context";
import {
  bindAccountToUser,
  validateGoogleIdentity,
} from "@/server/account-binding";
import { createAccount, updateAccount } from "@/server/accounts";
import { requireCurriculumAdmin } from "@/modules/accounts/guards";
import { GET as me } from "@/app/api/me/route";
import { GET as list, POST as add } from "@/app/api/admin/accounts/route";
import { checkMutationOrigin, readJson } from "@/server/http";
import type { AccountContext } from "@/modules/accounts/types";

const createdAccessIds: string[] = [];
const createdUserIds: string[] = [];
let manager: AccountContext;
let managerHeaders: Headers;
let curriculumId: string;
let versionId: string;
let adminHeaders: Headers;
let studentHeaders: Headers;
let rootSessionId: string;
const database = getDatabase();
function studentData() {
  return {
    email: `${randomUUID()}@aps-tests.invalid`,
    role: "student",
    status: "active",
    studentCode: `T-${randomUUID().slice(0, 20)}`,
    curriculumIds: [],
    curriculumVersionId: versionId,
    trackState: "unknown",
    trackId: null,
  };
}

beforeAll(async () => {
  const root = await createIdentity(
    "admin",
    true,
    "fixture-manager@aps-tests.invalid",
  );
  curriculumId = root.curriculum.id;
  versionId = root.version.id;
  const rootFixture = await createSessionFixture(root.user.id);
  managerHeaders = rootFixture.headers;
  rootSessionId = rootFixture.session.id;
  manager = await requireAccount(managerHeaders);
  for (const role of ["admin", "student"] as const) {
    const identity = await createIdentity(role);
    createdAccessIds.push(identity.access.id);
    createdUserIds.push(identity.user.id);
    const fixture = await createSessionFixture(identity.user.id);
    if (role === "admin") adminHeaders = fixture.headers;
    else studentHeaders = fixture.headers;
  }
});

afterAll(async () => {
  if (rootSessionId)
    await database.session.deleteMany({ where: { id: rootSessionId } });
  await database.auditEvent.deleteMany({
    where: { targetAccountId: { in: createdAccessIds } },
  });
  await database.curriculumAdmin.deleteMany({
    where: { accountAccessId: { in: createdAccessIds } },
  });
  await database.studentEnrollment.deleteMany({
    where: { accountAccessId: { in: createdAccessIds } },
  });
  await database.accountAccess.deleteMany({
    where: { id: { in: createdAccessIds } },
  });
  await database.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await database.$disconnect();
});

describe("real PostgreSQL and session boundaries", () => {
  it("anonymous context request returns 401", async () => {
    expect((await me(new Request("http://localhost:3101/api/me"))).status).toBe(
      401,
    );
  });
  it("rejects tampered cookie signatures", async () => {
    const headers = new Headers(managerHeaders);
    headers.set("cookie", `${headers.get("cookie")}forged`);
    expect(
      (await me(new Request("http://localhost:3101/api/me", { headers })))
        .status,
    ).toBe(401);
  });
  it("returns server identity even with forged client query", async () => {
    const response = await me(
      new Request("http://localhost:3101/api/me?role=admin&student_id=other", {
        headers: studentHeaders,
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.account.role).toBe("student");
    expect(body.account.canManageAccounts).toBe(false);
    expect(body.account.enrollment.trackState).toBe("unknown");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("student and curriculum admin cannot list accounts", async () => {
    for (const headers of [studentHeaders, adminHeaders])
      expect(
        (
          await list(
            new Request("http://localhost:3101/api/admin/accounts", {
              headers,
            }),
          )
        ).status,
      ).toBe(403);
  });
  it("curriculum admin is denied another curriculum", async () => {
    const context = await requireAccount(adminHeaders);
    expect(() => requireCurriculumAdmin(context, curriculumId)).not.toThrow();
    expect(() => requireCurriculumAdmin(context, randomUUID())).toThrow(
      "ไม่มีสิทธิ์",
    );
  });
  it("rejects unlisted, unverified and conflicting Google identities", async () => {
    await expect(
      validateGoogleIdentity("unlisted@aps-tests.invalid", true),
    ).rejects.toMatchObject({ code: "ACCOUNT_NOT_ALLOWED" });
    await expect(
      validateGoogleIdentity("fixture-manager@aps-tests.invalid", false),
    ).rejects.toMatchObject({ code: "GOOGLE_EMAIL_UNVERIFIED" });
    await expect(
      validateGoogleIdentity(
        "fixture-manager@aps-tests.invalid",
        true,
        "different-subject",
      ),
    ).rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });
  });
  it("strictly rejects privilege injection through the real API", async () => {
    const headers = new Headers(managerHeaders);
    headers.set("origin", "http://localhost:3101");
    headers.set("content-type", "application/json");
    const response = await add(
      new Request("http://localhost:3101/api/admin/accounts", {
        method: "POST",
        headers,
        body: JSON.stringify({ ...studentData(), canManageAccounts: true }),
      }),
    );
    expect(response.status).toBe(400);
  });
  it("requires same origin and bounds streamed JSON", async () => {
    expect(() =>
      checkMutationOrigin(
        new Request("http://localhost:3101/api/admin/accounts", {
          method: "POST",
          headers: {
            origin: "https://other.test",
            "content-type": "application/json",
          },
        }),
      ),
    ).toThrow("ไม่ได้รับอนุญาต");
    await expect(
      readJson(
        new Request("http://localhost:3101/x", {
          method: "POST",
          body: "x".repeat(16_385),
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("creates account context preserving leading zero, rejects duplicates and stale versions", async () => {
    const input = {
      ...studentData(),
      studentCode: `00${randomUUID().slice(0, 20)}`,
    };
    const account = await createAccount(manager, input);
    createdAccessIds.push(account.id);
    expect(account.enrollment?.studentCode).toBe(input.studentCode);
    await expect(createAccount(manager, input)).rejects.toMatchObject({
      code: "P2002",
    });
    const updated = await updateAccount(manager, account.id, {
      ...input,
      status: "inactive",
      expectedVersion: account.version,
    });
    expect(updated.status).toBe("inactive");
    await expect(
      updateAccount(manager, account.id, {
        ...input,
        expectedVersion: account.version,
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expect(
      validateGoogleIdentity(input.email, true),
    ).rejects.toMatchObject({ code: "ACCOUNT_NOT_ALLOWED" });
    expect(
      await database.auditEvent.count({
        where: { targetAccountId: account.id },
      }),
    ).toBe(2);
  });
  it("binding is atomic under concurrent attempts and cannot transfer ownership", async () => {
    const identity = await createIdentity("student");
    createdAccessIds.push(identity.access.id);
    createdUserIds.push(identity.user.id);
    const results = await Promise.all([
      bindAccountToUser(identity.user.id),
      bindAccountToUser(identity.user.id),
    ]);
    expect(results[0].authUserId).toBe(identity.user.id);
    expect(results[1].authUserId).toBe(identity.user.id);
    expect(
      (
        await database.accountAccess.findUniqueOrThrow({
          where: { id: identity.access.id },
        })
      ).version,
    ).toBe(2);
    const duplicate = await database.user.create({
      data: {
        name: "ทดสอบ",
        email: `${randomUUID()}@aps-tests.invalid`,
        emailVerified: true,
      },
    });
    createdUserIds.push(duplicate.id);
    await expect(
      database.accountAccess.update({
        where: { id: identity.access.id },
        data: { authUserId: manager.authUserId },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
  it("duplicate student identity rolls back the new account and preserves its owner", async () => {
    const input = studentData();
    const account = await createAccount(manager, input);
    createdAccessIds.push(account.id);
    const otherEmail = `${randomUUID()}@aps-tests.invalid`;
    await expect(
      createAccount(manager, { ...input, email: otherEmail }),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(
      await database.accountAccess.findUnique({ where: { email: otherEmail } }),
    ).toBeNull();
    expect(
      (
        await database.studentEnrollment.findUniqueOrThrow({
          where: { accountAccessId: account.id },
        })
      ).studentCode,
    ).toBe(input.studentCode);
  });
  it("concurrent edits with the same version commit only once", async () => {
    const input = studentData();
    const account = await createAccount(manager, input);
    createdAccessIds.push(account.id);
    const results = await Promise.allSettled([
      updateAccount(manager, account.id, {
        ...input,
        status: "inactive",
        expectedVersion: account.version,
      }),
      updateAccount(manager, account.id, {
        ...input,
        status: "active",
        expectedVersion: account.version,
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toMatchObject({
      code: "VERSION_CONFLICT",
    });
    expect(
      (
        await database.accountAccess.findUniqueOrThrow({
          where: { id: account.id },
        })
      ).version,
    ).toBe(account.version + 1);
  });
  it("changing permissions revokes sessions and locks bound identity", async () => {
    const identity = await createIdentity("student");
    createdAccessIds.push(identity.access.id);
    createdUserIds.push(identity.user.id);
    const fixture = await createSessionFixture(identity.user.id);
    const previous = await database.accountAccess.findUniqueOrThrow({
      where: { id: identity.access.id },
      include: { enrollment: true },
    });
    const input = {
      email: previous.email,
      role: "student",
      status: "inactive",
      curriculumIds: [],
      studentCode: previous.enrollment!.studentCode,
      curriculumVersionId: versionId,
      trackState: "unknown",
      trackId: null,
      expectedVersion: previous.version,
    };
    await expect(
      updateAccount(manager, previous.id, {
        ...input,
        email: "new@aps-tests.invalid",
      }),
    ).rejects.toMatchObject({ code: "IDENTITY_LOCKED" });
    await updateAccount(manager, previous.id, input);
    expect(
      await database.session.count({ where: { userId: identity.user.id } }),
    ).toBe(0);
    await expect(requireAccount(fixture.headers)).rejects.toMatchObject({
      status: 401,
    });
    await expect(createSessionFixture(identity.user.id)).rejects.toBeDefined();
  });
  it("protects root manager and expired sessions", async () => {
    const account = await database.accountAccess.findUniqueOrThrow({
      where: { id: manager.accountId },
    });
    await expect(
      updateAccount(manager, account.id, {
        email: account.email,
        role: "admin",
        status: "inactive",
        curriculumIds: [curriculumId],
        expectedVersion: account.version,
      }),
    ).rejects.toMatchObject({ code: "MANAGER_PROTECTED" });
    const identity = await createIdentity("admin");
    createdAccessIds.push(identity.access.id);
    createdUserIds.push(identity.user.id);
    const fixture = await createSessionFixture(identity.user.id);
    await database.session.update({
      where: { id: fixture.session.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(requireAccount(fixture.headers)).rejects.toMatchObject({
      status: 401,
    });
  });
  it("actual sign-out invalidates the database session", async () => {
    const identity = await createIdentity("admin");
    createdAccessIds.push(identity.access.id);
    createdUserIds.push(identity.user.id);
    const fixture = await createSessionFixture(identity.user.id);
    const headers = new Headers(fixture.headers);
    headers.set("origin", "http://localhost:3101");
    headers.set("content-type", "application/json");
    const response = await getAuth().handler(
      new Request("http://localhost:3101/api/auth/sign-out", {
        method: "POST",
        headers,
        body: "{}",
      }),
    );
    expect(response.status).toBe(200);
    await expect(requireAccount(fixture.headers)).rejects.toMatchObject({
      status: 401,
    });
  });
});
