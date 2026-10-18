import test from "node:test";
import assert from "node:assert/strict";
import { validateTarget, runDirectory, compareSnapshots, projectAccountInventory } from "./audit.mjs";

const env = { DATABASE_URL: "postgresql://user:private@127.0.0.1/aps_v2_dev", BETTER_AUTH_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "configured", GOOGLE_CLIENT_SECRET: "private", BETTER_AUTH_SECRET: "x".repeat(32) };

test("real audit only accepts configured local dev, never a remote/test/demo target", () => {
  assert.equal(validateTarget(env).database, "aps_v2_dev");
  for (const DATABASE_URL of ["", "postgresql://u:p@remote/aps_v2_dev", "postgresql://u:p@localhost/aps_v2_test", "https://localhost/aps_v2_dev"])
    assert.throws(() => validateTarget({ ...env, DATABASE_URL }));
  assert.throws(() => validateTarget({ ...env, APS_DEMO_MODE: "1" }));
  assert.throws(() => validateTarget({ ...env, BETTER_AUTH_URL: "http://localhost:3102" }));
  assert.throws(() => validateTarget({ ...env, GOOGLE_CLIENT_SECRET: "" }));
  assert.throws(() => validateTarget({ ...env, BETTER_AUTH_SECRET: "short" }));
});

test("private run paths cannot escape ignored storage", () => {
  assert.match(runDirectory("20261018-01"), /storage[\\/]auth-audit[\\/]round-8/);
  for (const run of ["..", "../outside", "C:\\private", "a/b", "a b", ""]) assert.throws(() => runDirectory(run));
});

test("checkpoints detect added/removed/changed business data and retained evidence", () => {
  const before = { database: { protectedTables: { AccountAccess: { sha256: "a", rows: 2 } } }, files: { "report.md": "b" } };
  const equal = structuredClone(before);
  assert.equal(compareSnapshots(before, equal).businessDataUnchanged, true);
  equal.database.protectedTables.AccountAccess.sha256 = "different";
  assert.equal(compareSnapshots(before, equal).businessDataUnchanged, false);
  delete equal.files["report.md"];
  assert.equal(compareSnapshots(before, equal).protectedFilesUnchanged, false);
  equal.files["new.md"] = "c";
  assert.equal(compareSnapshots(before, equal).changedFileCount, 2);
});

test("public inventory exposes only role counts, never identities or permission details", () => {
  const accounts = [{ id: "private-id", authUserId: "private-auth", email: "private@example.invalid", role: "student", status: "active", googleBound: true, emailVerified: true },
    { role: "admin", status: "inactive", googleBound: true, emailVerified: true }];
  const result = projectAccountInventory(accounts);
  assert.equal(result[0].activeGoogleBoundVerified, 1);
  assert.equal(result[1].activeGoogleBoundVerified, 0);
  assert.equal(JSON.stringify(result).includes("private"), false);
  assert.deepEqual(Object.keys(result[0]), ["role", "activeGoogleBoundVerified", "aliasesAssigned"]);
});
