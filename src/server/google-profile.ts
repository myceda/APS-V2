import "server-only";
import type { GoogleProfile } from "better-auth/social-providers";
import { createRemoteJWKSet, customFetch, errors, jwtVerify } from "jose";
import { logAuthIssue } from "./auth-diagnostics";

class GoogleKeysError extends Error {
  constructor(readonly reason: "KEYS_NETWORK_FAILED" | "KEYS_TIMEOUT" | "KEYS_HTTP_FAILED") {
    super(reason);
  }
}

// Cache public keys, never tokens. jose refreshes expired keys and handles key
// rotation; the fixed endpoint and manual redirects prevent following other URLs.
const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
  {
    timeoutDuration: 5_000,
    cacheMaxAge: 10 * 60_000,
    [customFetch]: async (url, options) => {
      let response: Response;
      try {
        response = await fetch(url, options);
      } catch (error) {
        throw new GoogleKeysError(
          options?.signal?.aborted || (error instanceof Error && error.name === "TimeoutError")
            ? "KEYS_TIMEOUT" : "KEYS_NETWORK_FAILED",
        );
      }
      if (response.status !== 200) throw new GoogleKeysError("KEYS_HTTP_FAILED");
      return response;
    },
  },
);

function logTokenFailure(error: unknown) {
  if (error instanceof GoogleKeysError) {
    logAuthIssue("google_keys", error.reason);
  } else if (error instanceof errors.JWKSTimeout) {
    logAuthIssue("google_keys", "KEYS_TIMEOUT");
  } else if (error instanceof errors.JWKSNoMatchingKey) {
    logAuthIssue("google_keys", "SIGNING_KEY_NOT_FOUND");
  } else if (error instanceof errors.JWTExpired) {
    logAuthIssue("google_token", "TOKEN_EXPIRED");
  } else if (error instanceof errors.JWSSignatureVerificationFailed) {
    logAuthIssue("google_token", "TOKEN_SIGNATURE_INVALID");
  } else if (error instanceof errors.JWTClaimValidationFailed) {
    const code = error.claim === "aud" ? "TOKEN_AUDIENCE_INVALID"
      : error.claim === "iss" ? "TOKEN_ISSUER_INVALID"
      : error.claim === "iat" || error.claim === "nbf" ? "TOKEN_TIME_INVALID"
      : "TOKEN_CLAIMS_INVALID";
    logAuthIssue("google_token", code);
  } else if (error instanceof errors.JWKSInvalid || error instanceof errors.JWKInvalid ||
    (error instanceof errors.JOSEError && error.code === "ERR_JOSE_GENERIC")) {
    logAuthIssue("google_keys", "KEYS_INVALID");
  } else {
    logAuthIssue("google_token", "TOKEN_INVALID");
  }
}

// Use only signed Google claims; never accept hosted-domain claims from a form.
export async function verifiedGoogleProfile(token: {
  idToken?: string;
  expectedIdTokenNonce?: string;
}) {
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) {
    logAuthIssue("configuration", "CLIENT_ID_MISSING");
    return null;
  }
  if (!token.idToken) {
    logAuthIssue("google_token", "ID_TOKEN_MISSING");
    return null;
  }
  let claims;
  try {
    ({ payload: claims } = await jwtVerify(token.idToken, googleKeys, {
      algorithms: ["RS256"],
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience,
      maxTokenAge: "1h",
      // Allow small differences between this server's clock and Google's clock.
      clockTolerance: 30,
    }));
  } catch (error) {
    logTokenFailure(error);
    return null;
  }
  if (token.expectedIdTokenNonce && claims.nonce !== token.expectedIdTokenNonce) {
    logAuthIssue("google_token", "TOKEN_NONCE_INVALID");
    return null;
  }
  if (typeof claims.sub !== "string" || !claims.sub.trim()) {
    logAuthIssue("google_profile", "PROFILE_SUBJECT_MISSING");
    return null;
  }
  if (typeof claims.email !== "string" || !claims.email.trim()) {
    logAuthIssue("google_profile", "PROFILE_EMAIL_MISSING");
    return null;
  }
  if (claims.email_verified !== true) {
    logAuthIssue("google_profile", "PROFILE_EMAIL_UNVERIFIED");
    return null;
  }
  if (typeof claims.iat !== "number" || typeof claims.exp !== "number" || typeof claims.iss !== "string") {
    logAuthIssue("google_profile", "PROFILE_CLAIMS_INCOMPLETE");
    return null;
  }
  const text = (name: string) =>
    typeof claims[name] === "string" ? (claims[name] as string) : "";
  // The provider profile type requires optional Google display claims.
  const data: GoogleProfile = {
    aud: audience,
    azp: text("azp"),
    sub: claims.sub,
    email: claims.email,
    email_verified: true,
    iss: claims.iss,
    iat: claims.iat,
    exp: claims.exp,
    name: text("name"),
    given_name: text("given_name"),
    family_name: text("family_name"),
    picture: text("picture"),
    hd: typeof claims.hd === "string" ? claims.hd : undefined,
  };
  return {
    user: {
      email: claims.email,
      emailVerified: true,
      name: typeof claims.name === "string" ? claims.name : "",
      image: typeof claims.picture === "string" ? claims.picture : undefined,
      googleHostedDomain: typeof claims.hd === "string" ? claims.hd : null,
    },
    data,
  };
}
