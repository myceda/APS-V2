import { createHmac, randomUUID } from "node:crypto";
import { getDatabase } from "@/server/database";
import { getAuth } from "@/server/auth";
import type { Role } from "@/modules/accounts/types";

export function assertTestDatabase() {
  const url = new URL(process.env.DATABASE_URL || "");
  if (
    url.pathname !== "/aps_v2_test" ||
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("Refusing fixtures outside local aps_v2_test");
}

export async function ensureMetadata() {
  assertTestDatabase();
  const database = getDatabase();
  const curriculum = await database.curriculum.upsert({
    where: { code: "CS2565" },
    create: { code: "CS2565", name: "CS2565 ทดสอบ" },
    update: {},
  });
  const version = await database.curriculumVersion.upsert({
    where: { code: "CS2565-identity-draft" },
    create: {
      curriculumId: curriculum.id,
      code: "CS2565-identity-draft",
      state: "draft",
    },
    update: {},
  });
  const track = await database.track.upsert({
    where: {
      curriculumVersionId_code: {
        curriculumVersionId: version.id,
        code: "project",
      },
    },
    create: {
      curriculumVersionId: version.id,
      code: "project",
      name: "โครงงานวิจัย",
    },
    update: {},
  });
  await database.track.upsert({
    where: {
      curriculumVersionId_code: {
        curriculumVersionId: version.id,
        code: "cooperative",
      },
    },
    create: {
      curriculumVersionId: version.id,
      code: "cooperative",
      name: "สหกิจศึกษา",
    },
    update: {},
  });
  return { curriculum, version, track };
}

export async function createIdentity(
  role: Role,
  manager = false,
  email = `${randomUUID()}@aps-tests.invalid`,
) {
  assertTestDatabase();
  const database = getDatabase();
  const { curriculum, version } = await ensureMetadata();
  if (manager) {
    const root = await database.accountAccess.findFirst({
      where: { canManageAccounts: true },
    });
    if (root && root.email !== email)
      throw new Error(
        "Test account manager already exists; review test data instead of overwriting",
      );
  }
  const user = await database.user.upsert({
    where: { email },
    create: { name: "บัญชีทดสอบ", email, emailVerified: true },
    update: {},
  });
  await database.account.upsert({
    where: {
      providerId_accountId: {
        providerId: "google",
        accountId: `fixture:${email}`,
      },
    },
    create: {
      userId: user.id,
      providerId: "google",
      accountId: `fixture:${email}`,
    },
    update: {},
  });
  const access = await database.accountAccess.upsert({
    where: { email },
    create: {
      email,
      role,
      status: "active",
      canManageAccounts: manager,
      curriculumGrants:
        role === "admin"
          ? { create: { curriculumId: curriculum.id } }
          : undefined,
      enrollment:
        role === "student"
          ? {
              create: {
                studentCode: `T-${randomUUID().slice(0, 20)}`,
                curriculumVersionId: version.id,
                trackState: "unknown",
              },
            }
          : undefined,
    },
    update: {},
  });
  return { user, access, curriculum, version };
}

export async function createSessionFixture(userId: string) {
  assertTestDatabase();
  const authContext = await getAuth().$context;
  const session = await authContext.internalAdapter.createSession(userId);
  if (!session) throw new Error("Session fixture rejected by real hooks");
  const signature = createHmac("sha256", process.env.BETTER_AUTH_SECRET!)
    .update(session.token)
    .digest("base64");
  const value = encodeURIComponent(`${session.token}.${signature}`);
  const name = authContext.authCookies.sessionToken.name;
  return {
    session,
    headers: new Headers({ cookie: `${name}=${value}` }),
    cookie: {
      name,
      value,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax" as const,
      expires: Math.floor(session.expiresAt.getTime() / 1000),
    },
  };
}
