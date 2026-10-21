// Operator recorder for observations, not a test that generates human results.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { EXAM_POLICY, GOOGLE_STEPS, TRIAL_STEPS } from "./exam-readiness.mjs";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const docs = path.resolve(root, "../aps-v2-doc/deliverables/completion-100");
const directory = path.join(docs, "exam-2026-10-21"); mkdirSync(directory, { recursive: true });
const file = path.join(directory, "manual-results.json");
const args = process.argv.slice(2), command = args[0];
const option = key => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
if (command === "init") {
  if (!existsSync(file)) {
    const sourceSnapshot = JSON.parse(readFileSync(path.join(docs, "acceptance-results.json"), "utf8")).examPolicy.sourceSnapshot;
    const empty = id => ({ id, status: "not_run", method: null, observedAt: null, actual: "", assistance: "not_observed" });
    writeFileSync(file, JSON.stringify({ policyVersion: EXAM_POLICY, sourceSnapshot, google: { steps: GOOGLE_STEPS.map(empty) }, trial: { participantCount: 0, participant: { alias: null, firstTime: null }, steps: TRIAL_STEPS.map(empty) } }, null, 2) + "\n", { flag: "wx" });
  }
  console.log("Exam observation form ready; no observations generated");
} else if (command === "record") {
  const evidence = JSON.parse(readFileSync(file, "utf8"));
  const section = option("--section"), id = option("--step"), actual = option("--actual"), method = option("--method"), status = option("--status");
  const permitted = section === "google" ? GOOGLE_STEPS : section === "trial" ? TRIAL_STEPS : [];
  if (!permitted.includes(id) || !["direct_browser_observation", "user_report"].includes(method) || !["passed", "failed", "partial"].includes(status) || !actual?.trim() || /@|token|cookie|https?:\/\/|password|otp/i.test(actual)) throw new Error("Provide a valid observation without email, URL, credentials or tokens");
  const step = evidence[section].steps.find(s => s.id === id);
  if (section === "trial") {
    const alias = option("--participant"), firstTime = option("--first-time"), assistance = option("--assistance");
    if (!alias || !/^[a-z0-9-]{1,40}$/.test(alias) || !["yes", "no"].includes(firstTime) || !assistance || /@|https?:\/\//i.test(assistance)) throw new Error("Trial requires participant alias, first-time yes/no and actual assistance");
    evidence.trial.participantCount = 1;
    if (evidence.trial.participant.alias && evidence.trial.participant.alias !== alias) throw new Error("One-participant plan: do not silently replace the observed person");
    evidence.trial.participant = { alias, firstTime: firstTime === "yes" };
    step.assistance = assistance;
  }
  const history = path.join(directory, "observation-history"); mkdirSync(history, { recursive: true });
  const at = new Date().toISOString();
  writeFileSync(path.join(history, `${at.replace(/[:.]/g, "-")}-${section}-${id}.json`), JSON.stringify({ previous: step, next: { id, status, method, observedAt: at, actual } }, null, 2) + "\n", { flag: "wx" });
  // Bind only this new observation to the current build; never re-credit old steps.
  const sourceSnapshot = JSON.parse(readFileSync(path.join(docs, "acceptance-results.json"), "utf8")).examPolicy.sourceSnapshot;
  Object.assign(step, { status, method, observedAt: at, actual, sourceSnapshot });
  writeFileSync(file, JSON.stringify(evidence, null, 2) + "\n");
  if (section === "trial") {
    const kitFile = path.join(docs, "user-trial-ready.json");
    const kit = JSON.parse(readFileSync(kitFile, "utf8"));
    kit.status = evidence.trial.steps.every(s => s.status === "passed") ? "observed_by_user" : "in_progress_observed";
    kit.participants = "one_participant_two_roles_user_report";
    kit.observationsReference = "exam-2026-10-21/manual-results.json";
    writeFileSync(kitFile, JSON.stringify(kit, null, 2) + "\n");
  }
  console.log(`Recorded ${section}/${id}: ${status}; ${method}`);
} else throw new Error("Use init or record with explicit observation fields");
