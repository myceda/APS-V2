import test from "node:test";
import assert from "node:assert/strict";
import { EXAM_POLICY, GOOGLE_STEPS, TRIAL_STEPS, assessExamEvidence, examReady } from "./exam-readiness.mjs";
// Synthetic evidence used only to test the recorder; never written to results.
function fixture() {
  const step = id => ({ id, status: "passed", method: "user_report", actual: "Synthetic recorder test, not real acceptance", observedAt: "2026-10-20T08:00:00Z", assistance: "none" });
  return { policyVersion: EXAM_POLICY, sourceSnapshot: "fixture", google: { steps: GOOGLE_STEPS.map(step) }, trial: { participantCount: 1, participant: { alias: "synthetic-tester", firstTime: true }, steps: TRIAL_STEPS.map(step) } };
}
test("missing evidence and a prepared kit cannot pass real Google or users", () => {
  assert.equal(assessExamEvidence(null, "fixture").trial, "not_run");
  assert.equal(assessExamEvidence({ prepared: true }, "fixture").google, "not_run");
});
test("one new person can complete two roles without being counted as two people", () => {
  const result = assessExamEvidence(fixture(), "fixture");
  assert.deepEqual(result, { google: "passed", trial: "passed", participantCount: 1, evidenceMatchesSnapshot: true });
  assert.equal(examReady({ engineering: true, manual: result, productionAuditTotal: 0, devReview: "documented_self_review" }), true);
});
test("missing observations, duplicate steps, fixtures and assistance cannot masquerade as independent acceptance", () => {
  for (const mutate of [e => { e.google.steps[0].actual = ""; }, e => { e.google.steps[0].method = "signed_fixture"; }, e => { e.google.steps.push(e.google.steps[0]); }]) {
    const evidence = fixture(); mutate(evidence);
    assert.equal(assessExamEvidence(evidence, "fixture").google, "partial");
  }
  const evidence = fixture(); evidence.trial.steps[0].assistance = "Developer pointed to the button";
  assert.equal(assessExamEvidence(evidence, "fixture").trial, "partial");
});
test("changed snapshot, failed step and unreviewed security keep readiness false", () => {
  assert.equal(assessExamEvidence(fixture(), "new-build").google, "partial");
  const evidence = fixture(); evidence.trial.steps[0].status = "failed";
  assert.equal(assessExamEvidence(evidence, "fixture").trial, "failed");
  const manual = assessExamEvidence(fixture(), "fixture");
  assert.equal(examReady({ engineering: true, manual, productionAuditTotal: 1, devReview: "documented_self_review" }), false);
  assert.equal(examReady({ engineering: true, manual, productionAuditTotal: 0, devReview: "pending" }), false);
});
test("a new observation does not re-credit old Google or trial observations", () => {
  const evidence = fixture();
  evidence.google.steps[0].sourceSnapshot = "new-build";
  assert.equal(assessExamEvidence(evidence, "new-build").google, "partial");
  for (const step of evidence.trial.steps) step.sourceSnapshot = "new-build";
  const result = assessExamEvidence(evidence, "new-build");
  assert.equal(result.trial, "passed");
  assert.equal(result.google, "partial");
  assert.equal(result.evidenceMatchesSnapshot, false);
});
