import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const docs = path.resolve(root, "../aps-v2-doc/deliverables/completion-100");
const checks = JSON.parse(readFileSync(path.join(docs, "checks.json"), "utf8"));
const latest = key => checks.attempts.filter(r => r.key === key).at(-1);
const all = latest("audit"), production = latest("audit-production");
assert.equal(all.vulnerabilities.total, 5); assert.equal(all.vulnerabilities.high, 5);
assert.equal(production.vulnerabilities.total, 0);
const raw = JSON.parse(readFileSync(path.resolve(root, all.privateLog), "utf8"));
const advisories = Object.values(raw.vulnerabilities).flatMap(v => v.via.filter(item => typeof item === "object").map(via => ({ title: via.title, url: via.url, severity: via.severity })));
const unique = [...new Map(advisories.map(a => [a.url, a])).values()];
assert.equal(unique.length, 1);
const result = { reviewedAt: new Date().toISOString(), status: "documented_self_review", reviewer: "agent_self_review_not_human_peer_review", method: "retained_dependency_reports_and_scoped_diff_review", auditCapturedAt: all.end, productionAuditCapturedAt: production.end, auditLogSha256: all.logSha256, productionAuditLogSha256: production.logSha256, findings: all.vulnerabilities, production: production.vulnerabilities, advisories: unique,
  affectedScope: "Development lint dependency chain; production omission scan reports zero. This is not a full application security assessment.",
  disposition: "Documented for the user-approved exam scope; findings remain unremediated. Do not downgrade the framework lint toolchain or force audit fixes before the exam.",
  humanPeerReview: "not_performed_not_required_for_exam", userScopeApproval: "User approved exam plan, one new participant in two roles, no mandatory external code review", fullSecurityCertification: false };
writeFileSync(path.join(docs, "exam-2026-10-21/security-review.json"), JSON.stringify(result, null, 2) + "\n");
console.log("Recorded self-review of five dev dependency entries from one advisory; zero production scan entries, no remediation or peer review claimed");
