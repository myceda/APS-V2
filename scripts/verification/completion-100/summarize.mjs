import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { EXAM_POLICY, assessExamEvidence, examReady } from "./exam-readiness.mjs";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const docs = path.resolve(root, "../aps-v2-doc/deliverables/completion-100");
const read = file => JSON.parse(readFileSync(file, "utf8"));
const checks = read(path.join(docs, "checks.json"));
const latest = key => checks.attempts.filter(r => r.key === key).at(-1);
const required = ["quality", "integration", "auth", "public", "recovery", "completion", "rehearsal", "demo", "handoff"];
const engineeringChecksPassed = required.every(k => latest(k)?.status === "passed");
const originalFile = path.resolve(docs, "../acceptance-followup/2026-10-20/acceptance-results.json");
const baseline = read(originalFile);
const hash = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const appFiles = ["src/server/academic.ts", "src/server/auth.ts", "src/server/account-binding.ts", "src/components/student-workspace.tsx", "src/components/student-track-criteria.tsx", "src/modules/curriculum/validation.ts", "src/app/page.tsx", "src/app/admin/page.tsx", "src/app/globals.css", "src/components/confirmed-transcript.tsx", "src/components/content-start-link.tsx", "src/components/account-shell.tsx", "src/components/account-shell.module.css", "src/components/account-session-guard.tsx", "src/components/academic-manager.tsx", "src/components/academic-ui.module.css", "src/modules/transcript/layout.ts", "scripts/demo/open.ts"];
const sourceSnapshot = createHash("sha256").update(JSON.stringify(Object.fromEntries(appFiles.map(file => [file, hash(path.join(root, file))])))).digest("hex");
const examDirectory = path.join(docs, "exam-2026-10-21");
const manualFile = path.join(examDirectory, "manual-results.json");
const manual = assessExamEvidence(existsSync(manualFile) ? read(manualFile) : null, sourceSnapshot);
const securityFile = path.join(examDirectory, "security-review.json");
const securityReview = existsSync(securityFile) ? read(securityFile) : null;
const devReview = securityReview?.status === "documented_self_review" && securityReview.auditLogSha256 === latest("audit")?.logSha256 && securityReview.productionAuditLogSha256 === latest("audit-production")?.logSha256 ? "documented_self_review" : "pending";
if (!checks.baseline.unchanged || hash(originalFile) !== checks.baseline.sha256Before) throw new Error("Historical acceptance was changed");
const rows = [
  ["C100-GPA", "AC-AUDIT-03", "Boundary raw/display/risk oracle; administrator draft/publication, policy snapshot and old result preservation", ["quality", "integration", "completion"]],
  ["C100-STATUS", "AC-AUDIT-05", "Empty/first/incomplete history and unconfirmed policy; explicit unverified official status, no invented probation count", ["quality", "completion"]],
  ["C100-OR", "AC-PLAN-06", "Unknown/complete synthetic 517111; isolated OR successors, administrator UI save and publication", ["quality", "completion"]],
  ["C100-REPEAT", "AC-PLAN-07", "Full 189-course catalogue, both tracks, four terms, F/pass/W histories, independent expected placements and 12/6 bounds", ["quality", "integration"]],
  ["C100-TRACK", "AC-PLAN-08", "Criteria scope/date/status, manual consent, published history and copy, permissions/conflicts, previous-result warning and keyboard refresh", ["quality", "integration", "auth", "completion"]],
];
const cases = rows.map(([id, originalAc, expected, evidence]) => ({ id, originalAc, expected, status: evidence.every(k => latest(k)?.status === "passed") ? "passed" : "partial", evidence: evidence.map(k => ({ check: k, logSha256: latest(k)?.logSha256 ?? null })) }));
cases.push({ id: "C100-USERS", originalAc: "AC-UX-04", expected: "One new participant performs student and administrator workflows, counted as one person in two roles", status: manual.trial, actual: manual.trial === "passed" ? "Recorded observations in exam-2026-10-21/manual-results.json; scope is one participant in two roles" : "Real observations incomplete; prepared kit or AI fixtures do not pass this case" });
const result = {
  checkedAt: new Date().toISOString(), scope: "Approved project completion supplement; not university rule certification or deployment",
  originalAcceptance: { path: "../acceptance-followup/2026-10-20/acceptance-results.json", sha256: hash(originalFile), summary: baseline.summary, finalReady: baseline.finalReady, unchanged: true },
  cases, summary: { total: cases.length, passed: cases.filter(c => c.status === "passed").length, partial: cases.filter(c => c.status === "partial").length, failed: cases.filter(c => c.status === "failed").length, not_run: cases.filter(c => c.status === "not_run").length },
  examPolicy: { version: EXAM_POLICY, sourceSnapshot, requiredParticipants: 1, participantRoles: ["student", "admin"], humanPeerReviewRequired: false },
  engineeringChecksPassed,
  releaseGates: { newRealUsers: manual.trial, realGoogleOnFinalVersion: manual.google, humanPeerReview: "not_performed_not_required_for_exam", devDependencyFindingsReview: devReview, ci: "not_claimed", deployment: "out_of_scope" },
  security: { allDependencies: latest("audit")?.vulnerabilities ?? null, productionDependencies: latest("audit-production")?.vulnerabilities ?? null, disclaimer: "Dependency scan only, not full security certification; dev findings remain unremediated and review status is recorded separately" },
  finalReady: examReady({ engineering: engineeringChecksPassed, manual, productionAuditTotal: latest("audit-production")?.vulnerabilities?.total, devReview }), officialRulesConfirmed: false,
  limitations: ["Historical 89.82 is not recalculated or renamed 100", "Five engineering supplement cases use synthetic administrator inputs; not official policy verification", "Google fixtures do not prove real Google login", "Self-review does not replace human peer review", "Desktop/mobile refer to emulated Chromium viewports, not physical devices", "Earlier failed runs retained with reasons; latest pass does not erase them"],
};
writeFileSync(path.join(docs, "acceptance-results.json"), JSON.stringify(result, null, 2) + "\n");
// Only explicit screenshots from synthetic successful invocations are exported.
const images = path.join(docs, "evidence-images"); mkdirSync(images, { recursive: true });
const browserDir = latest("completion") ? path.resolve(root, path.dirname(latest("completion").privateLog), "browser/artifacts") : "";
const imageMap = [
  ["closure-C100-GPA-OR-admini-89b89--and-preserves-old-analysis-desktop/policy-and-status.png", "policy-desktop.png"],
  ["closure-C100-GPA-OR-admini-89b89--and-preserves-old-analysis-mobile/policy-and-status.png", "policy-mobile.png"],
  ["closure-C100-TRACK-manual--97bea-nd-refreshed-student-result-desktop/manual-consent.png", "criteria-desktop.png"],
  ["closure-C100-TRACK-manual--97bea-nd-refreshed-student-result-mobile/manual-consent.png", "criteria-mobile.png"],
];
const exported = [];
for (const [from, to] of imageMap) {
  const source = path.join(browserDir, from);
  if (browserDir && latest("completion")?.status === "passed" && existsSync(source)) { copyFileSync(source, path.join(images, to)); exported.push({ file: `evidence-images/${to}`, sha256: hash(source) }); }
}
const rehearsalDirectory = latest("rehearsal") ? path.resolve(root, path.dirname(latest("rehearsal").privateLog), "rehearsal") : "";
const stepsFile = path.join(rehearsalDirectory, "steps.json");
if (latest("rehearsal")?.status === "passed" && existsSync(stepsFile)) {
  const steps = read(stepsFile);
  for (const step of steps) {
    const source = path.join(rehearsalDirectory, step.evidence);
    const to = `rehearsal-${path.basename(step.evidence)}`;
    copyFileSync(source, path.join(images, to));
    exported.push({ file: `evidence-images/${to}`, sha256: hash(source), checkedAt: step.checkedAt });
  }
}
writeFileSync(path.join(docs, "image-manifest.json"), JSON.stringify({ synthetic: true, exported, visualQa: "policy-mobile and criteria-desktop manually viewed; other files are browser captures, not individually reviewed" }, null, 2) + "\n");
const figures = exported.map((item, i) => `<figure id="image-${i + 1}"><img loading="lazy" src="${item.file}" alt="หลักฐานสังเคราะห์ ${i + 1}" style="max-width:100%;height:auto"><figcaption>${item.file}</figcaption></figure>`).join("\n");
writeFileSync(path.join(docs, "backup.html"), `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>APS-v2 หลักฐานสาธิต</title><style>body{font:18px/1.6 system-ui,sans-serif;max-width:1100px;margin:32px auto;padding:0 16px;background:#f5f7f9;color:#172333}figure{margin:32px 0;padding:16px;background:white;border:1px solid #ccd6dd}a:focus-visible{outline:3px solid #006f66}</style><h1>APS-v2 — ภาพหลักฐานสังเคราะห์</h1><p>ภาพจากการทดสอบจริง ไม่ใช่สถานะสด ไม่ใช่ Google จริงหรือการทดลองผู้ใช้ใหม่ เกณฑ์สาธิตไม่ใช่การอนุมัติจากมหาวิทยาลัย รายงานยังไม่รับรอง100%</p><p>ผลตรวจ ${result.checkedAt} · <a href="report.md">รายงาน</a></p><nav aria-label="เลือกภาพ">${exported.map((_, i) => `<a href="#image-${i + 1}">ภาพ ${i + 1}</a>`).join(" · ")}</nav>${figures}</html>`);
console.log(JSON.stringify({ engineeringChecksPassed, supplement: result.summary, finalReady: result.finalReady, exportedImages: exported.length, realGoogle: manual.google, trial: manual.trial }));
