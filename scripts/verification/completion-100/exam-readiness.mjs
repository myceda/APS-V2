export const EXAM_POLICY = "exam-2026-10-21-v1";
export const GOOGLE_STEPS = ["student-sign-in", "student-admin-denied", "student-sign-out", "student-fresh-login", "admin-sign-in", "admin-scope", "admin-sign-out", "admin-fresh-login", "account-switch-back-refresh"];
export const TRIAL_STEPS = ["student-flow", "admin-flow"];
const methods = ["direct_browser_observation", "user_report"];
function completed(step) {
  return step?.status === "passed" && methods.includes(step.method) &&
    typeof step.actual === "string" && step.actual.trim().length > 0 &&
    typeof step.observedAt === "string" && Number.isFinite(Date.parse(step.observedAt));
}
function status(steps, ids) {
  if (!Array.isArray(steps) || !steps.length || steps.every(s => s.status === "not_run")) return "not_run";
  if (steps.some(s => ids.includes(s.id) && s.status === "failed")) return "failed";
  // Duplicate IDs are ambiguous; do not silently use the most favorable entry.
  return ids.every(id => steps.filter(s => s.id === id).length === 1 && completed(steps.find(s => s.id === id))) ? "passed" : "partial";
}
export function assessExamEvidence(manual, snapshot) {
  if (!manual) return { google: "not_run", trial: "not_run", participantCount: 0, evidenceMatchesSnapshot: false };
  const matches = step => manual.policyVersion === EXAM_POLICY && (step?.sourceSnapshot ?? manual.sourceSnapshot) === snapshot;
  const googleMatches = GOOGLE_STEPS.every(id => matches(manual.google?.steps?.find(s => s.id === id)));
  const trialMatches = TRIAL_STEPS.every(id => matches(manual.trial?.steps?.find(s => s.id === id)));
  const evidenceMatchesSnapshot = googleMatches && trialMatches;
  let google = status(manual.google?.steps, GOOGLE_STEPS);
  let trial = status(manual.trial?.steps, TRIAL_STEPS);
  const participant = manual.trial?.participant;
  const oneNewPerson = manual.trial?.participantCount === 1 && typeof participant?.alias === "string" && participant.alias.trim() && participant.firstTime === true;
  if (trial === "passed" && (!oneNewPerson || manual.trial.steps.some(s => s.assistance !== "none"))) trial = "partial";
  if (!googleMatches && google === "passed") google = "partial";
  if (!trialMatches && trial === "passed") trial = "partial";
  return { google, trial, participantCount: oneNewPerson ? 1 : 0, evidenceMatchesSnapshot };
}
export function examReady({ engineering, manual, productionAuditTotal, devReview }) {
  return engineering === true && manual.google === "passed" && manual.trial === "passed" &&
    productionAuditTotal === 0 && devReview === "documented_self_review";
}
