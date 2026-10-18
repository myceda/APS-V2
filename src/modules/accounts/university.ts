import { normalizeEmail } from "./guards";

export function isUniversityIdentity(email: string, hostedDomain: unknown) {
  const normalized = normalizeEmail(email);
  return (
    /^[^\s@]+@silpakorn\.edu$/.test(normalized) &&
    hostedDomain === "silpakorn.edu"
  );
}
