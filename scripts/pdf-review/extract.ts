// Private output only. Never print payloads or source filenames.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { extractPdf } from "../../src/server/pdf-extraction";
const labels = ["CS_Moss", "CS_F", "CS_Golf", "CS_Neoi", "CS_Minie"];
const root = path.resolve("storage/pdf-review/round-3");
const input = process.env.APS_TRANSCRIPT_INPUT_DIR || "C:/Users/MyLuna/thesis-doc-1_69/example-transcript";
await mkdir(root, { recursive: true });
const samples = [];
for (const [i, label] of labels.entries()) {
  const bytes = await readFile(path.join(input, `${label}.pdf`));
  samples.push({ sampleId: `sample-${i + 1}`, sourceSha256: createHash("sha256").update(bytes).digest("hex"), payload: await extractPdf(new Uint8Array(bytes)) });
}
await writeFile(path.join(root, "actual.json"), JSON.stringify(samples, null, 2), { mode: 0o600 });
console.log("Private reader output saved for 5 samples; no identities exported.");
