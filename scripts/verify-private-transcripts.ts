// Read private PDFs without persisting their identities, filenames or contents in reports.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { extractPdf } from "../src/server/pdf-extraction";
const input =
  process.env.APS_TRANSCRIPT_INPUT_DIR ||
  "C:/Users/MyLuna/thesis-doc-1_69/example-transcript";
const documentRoot = "C:/Users/MyLuna/aps-v2-doc";
const reference = JSON.parse(
  await readFile(
    path.join(documentRoot, "tmp/verification/pdfjs-results.json"),
    "utf8",
  ),
);
const labels = ["CS_Moss", "CS_F", "CS_Golf", "CS_Neoi", "CS_Minie"];
const checks = [];
for (const [index, label] of labels.entries()) {
  const bytes = new Uint8Array(
    await readFile(path.join(input, label + ".pdf")),
  );
  const parsed = await extractPdf(bytes);
  const expected = reference.samples.find(
    (s: { sampleId: string }) => s.sampleId === `sample-${index + 1}`,
  );
  const mismatches = parsed.attempts.filter((row, i) => {
    const e = expected.rows[i];
    return (
      !e ||
      row.courseCode !== e.courseCode ||
      row.credits !== e.reportedCredits ||
      row.grade !== e.grade ||
      row.gradePoints !== e.reportedGradePoints ||
      row.year !== e.term.year ||
      row.semester !== e.term.semester
    );
  }).length;
  checks.push({
    sampleId: `sample-${index + 1}`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    rows: parsed.attempts.length,
    referenceRows: expected.rows.length,
    rowMismatches: mismatches,
    rowAgreement:
      mismatches === 0 && parsed.attempts.length === expected.rows.length,
    headerPresence: Object.fromEntries(
      Object.entries(parsed.header)
        .filter(([key]) => !["track", "trackState"].includes(key))
        .map(([key, value]) => [key, (value as { state: string }).state]),
    ),
    trackAgreement: parsed.header.track === expected.trackHint,
    reportedSummaryCount: parsed.summaries.length,
  });
}
await mkdir(path.join(documentRoot, "deliverables/evidence/final-readiness"), {
  recursive: true,
});
await writeFile(
  path.join(
    documentRoot,
    "deliverables/evidence/final-readiness/pdf-extraction.json",
  ),
  JSON.stringify(
    {
      purpose:
        "new_application_reader_verification_not_full_application_acceptance",
      checkedAt: new Date().toISOString(),
      checks,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(checks));
if (
  checks.some(
    (c) =>
      !c.rowAgreement ||
      !c.trackAgreement ||
      Object.values(c.headerPresence).some((s) => s !== "present"),
  )
)
  process.exitCode = 1;
