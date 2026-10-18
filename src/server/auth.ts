import "server-only";
import { betterAuth, APIError } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { AccessError } from "@/modules/accounts/errors";
import { getDatabase } from "./database";
import { bindAccountToUser, validateGoogleIdentity } from "./account-binding";
import { verifiedGoogleProfile } from "./google-profile";
import { logBetterAuthIssue } from "./auth-diagnostics";
import {
  createAuthMiddleware,
  addOAuthServerContext,
  getOAuthState,
} from "better-auth/api";
import {
  parseLoginEmail,
  requireMatchingLoginEmail,
} from "@/modules/accounts/login-email";

export function isGoogleReady() {
  return Boolean(
    process.env.DATABASE_URL &&
      process.env.BETTER_AUTH_SECRET &&
      process.env.BETTER_AUTH_SECRET.length >= 32 &&
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET,
  );
}

function authForbidden(error: unknown): never {
  throw new APIError("FORBIDDEN", {
    code: error instanceof AccessError ? error.code : "AUTH_UNAVAILABLE",
    message: "ไม่สามารถเข้าสู่ระบบด้วยบัญชีนี้ได้ กรุณาติดต่อผู้ดูแล",
  });
}

function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new AccessError(
      503,
      "AUTH_NOT_CONFIGURED",
      "ระบบเข้าสู่ระบบยังไม่พร้อม กรุณาติดต่อผู้ดูแล",
    );
  const baseURL = process.env.BETTER_AUTH_URL || "http://localhost:3000";
  // input:false intentionally excludes provider fields too. Carry the validated
  // domain through this request's hook context, never through editable user input.
  const googleProofs = new WeakMap<
    object,
    { email: string; hostedDomain: string | null }
  >();
  return betterAuth({
    appName: "APS-v2",
    baseURL,
    secret,
    database: prismaAdapter(getDatabase(), {
      provider: "postgresql",
      transaction: true,
    }),
    trustedOrigins: [new URL(baseURL).origin],
    emailAndPassword: { enabled: false },
    account: { accountLinking: { enabled: false } },
    session: {
      expiresIn: 8 * 60 * 60,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    advanced: { database: { generateId: "uuid" } },
    logger: {
      level: "warn",
      log: logBetterAuthIssue,
    },
    onAPIError: { errorURL: `${baseURL}/sign-in` },
    hooks: {
      before: createAuthMiddleware(async (context) => {
        if (
          context.path === "/sign-in/social" &&
          context.body?.provider === "google"
        ) {
          const email = parseLoginEmail(context.body.loginHint);
          if (email) await addOAuthServerContext({ apsLoginEmail: email });
        }
      }),
    },
    user: {
      additionalFields: {
        googleHostedDomain: { type: "string", required: false, input: false },
      },
      validateUserInfo: async ({ user, source }, context) => {
        if (source.method !== "oauth" || source.oauth?.providerId !== "google")
          return { error: "GOOGLE_ACCOUNT_REQUIRED" };
        try {
          const profile = source.oauth.profile;
          const state = await getOAuthState<{
            serverContext?: { apsLoginEmail?: string };
          }>();
          requireMatchingLoginEmail(
            state?.serverContext?.apsLoginEmail,
            user.email || "",
          );
          await validateGoogleIdentity(
            user.email || "",
            profile?.email_verified === true && user.emailVerified === true,
            typeof profile?.sub === "string" ? profile.sub : undefined,
            profile?.hd,
          );
          googleProofs.set(context, {
            email: (user.email || "").trim().toLowerCase(),
            hostedDomain: typeof profile?.hd === "string" ? profile.hd : null,
          });
        } catch (error) {
          console.warn(JSON.stringify({event:"google_login_rejected",code:error instanceof AccessError ? error.code : "AUTH_UNAVAILABLE"}));
          return {
            error:
              error instanceof AccessError ? error.code : "AUTH_UNAVAILABLE",
          };
        }
      },
    },
    socialProviders: isGoogleReady()
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            requireEmailVerification: true,
            disableIdTokenSignIn: true,
            prompt: "select_account",
            includeGrantedScopes: false,
            getUserInfo: verifiedGoogleProfile,
            overrideUserInfoOnSignIn: true,
          },
        }
      : {},
    databaseHooks: {
      user: {
        create: {
          before: async (user, context) => {
            const proof = context ? googleProofs.get(context) : undefined;
            const hostedDomain =
              proof?.email === user.email.trim().toLowerCase()
                ? proof.hostedDomain
                : null;
            try {
              await validateGoogleIdentity(
                user.email,
                user.emailVerified,
                undefined,
                hostedDomain,
              );
            } catch (error) {
              authForbidden(error);
            }
            return {
              data: {
                ...user,
                email: user.email.trim().toLowerCase(),
                googleHostedDomain: hostedDomain,
              },
            };
          },
        },
        update: {
          before: async (user, context) => {
            const proof = context ? googleProofs.get(context) : undefined;
            return {
              data: proof
                ? { ...user, googleHostedDomain: proof.hostedDomain }
                : user,
            };
          },
        },
      },
      account: {
        create: {
          before: async (account) => {
            if (account.providerId !== "google")
              authForbidden(
                new AccessError(
                  403,
                  "GOOGLE_ACCOUNT_REQUIRED",
                  "ใช้ Google เท่านั้น",
                ),
              );
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            try {
              await bindAccountToUser(session.userId);
            } catch (error) {
              authForbidden(error);
            }
          },
        },
      },
    },
  });
}

let auth: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  return (auth ??= createAuth());
}
