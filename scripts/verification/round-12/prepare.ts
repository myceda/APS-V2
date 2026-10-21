import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { configureDemo, cliOptions } from "../../demo/runtime";
import { DEMO_CASES } from "../../../src/modules/demo/config";
import { syntheticTranscript } from "../../../tests/support/synthetic-transcript";
configureDemo();
const { run } = cliOptions(process.argv.slice(2));
const { prepareDemo, demoSessions, demoContext, runDirectory, fingerprint, digest } = await import("../../demo/store");
const { studentWorkspace } = await import("../../../src/server/academic");
const { getDatabase } = await import("../../../src/server/database");
try {
  const { manifest } = await prepareDemo(run);
  const folder = runDirectory(run);
  const student = manifest.accounts.find(a => a.key === "not-selected")!;
  const pdf = syntheticTranscript(student.studentCode, "B", [
    { code: "517101", name: "Synthetic Computing" },
    { code: "511108", name: "Synthetic Calculus" },
  ]);
  // The demo criteria evaluate through 2568/2. Keep the same byte count so
  // this minimal PDF's stream lengths and cross-reference offsets stay valid.
  const input = Buffer.from(pdf.toString("binary").replace("Semester 1/2568", "Semester 2/2568"), "binary");
  await writeFile(path.join(folder, "rehearsal-input.pdf"), input, { flag: "wx" });
  const sessions = await demoSessions(manifest, [...DEMO_CASES]);
  await mkdir(path.join(folder, "sessions"), { recursive: true });
  for (const key of DEMO_CASES) await writeFile(path.join(folder, "sessions", `${key}.json`), JSON.stringify(sessions[key]), { flag: "wx", mode: 0o600 });
  const otherWorkspaces: Record<string, string> = {};
  for (const key of DEMO_CASES.filter(k => !["not-selected", "admin"].includes(k))) otherWorkspaces[key] = digest(JSON.stringify(await studentWorkspace(demoContext(manifest, key))));
  const originalRevisions = await getDatabase().transcriptRevision.findMany({ where: { ownerAccountId: { in: manifest.accounts.map(a => a.accountId) } }, orderBy: { id: "asc" } });
  await writeFile(path.join(folder, "rehearsal-before.json"), JSON.stringify({
    outside: await fingerprint(manifest, false), inside: await fingerprint(manifest, true), otherWorkspaces,
    originalRevisionIds: originalRevisions.map(r => r.id), originalRevisionsHash: digest(JSON.stringify(originalRevisions)),
    pdfSha256: digest(input), oracle: { gpax: 3, earnedCredits: 6, gradePoints: 18, gpaCredits: 6 },
  }, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ run, prepared: true, synthetic: true, input: path.join(folder, "rehearsal-input.pdf"), note: "Real parser input; two 3-credit B courses, not a university transcript or Google login" }));
} finally { await getDatabase().$disconnect(); }
