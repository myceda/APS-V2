import { readFile } from "node:fs/promises";
import { groupLines } from "../src/modules/transcript/layout";
import {
  getDocument,
  GlobalWorkerOptions,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
GlobalWorkerOptions.workerSrc = pathToFileURL(
  createRequire(import.meta.url).resolve(
    "pdfjs-dist/legacy/build/pdf.worker.mjs",
  ),
).href;
const file = "C:/Users/MyLuna/thesis-doc-1_69/example-transcript/CS_Moss.pdf";
const task = getDocument({
  data: new Uint8Array(await readFile(file)),
  verbosity: 0,
});
try {
  const doc = await task.promise;
  for (const pageNumber of [1]) {
    const page = await doc.getPage(pageNumber),
      text = await page.getTextContent();
    const lines = groupLines(
      text.items.filter(
        (
          item,
        ): item is typeof item & {
          str: string;
          transform: number[];
          width: number;
        } => "str" in item,
      ),
    );
    const labels = [
      "ชื่อ",
      "นามสกุล",
      "คณะ",
      "ภาควิชา",
      "ระดับ",
      "สาขา",
      "เลข",
      "รหัส",
      "ปริญญา",
      "นักศึกษา",
      "วิทยาศาสตร์",
      "วิทยาการคอมพิวเตอร์",
      "ประจำตัว",
      "เกรด",
    ];
    console.log(
      JSON.stringify({
        page: pageNumber,
        lines: lines
          .filter((l) => l.y > 590)
          .map((l) => ({
            y: l.y,
            labels: labels.filter((label) =>
              l.items
                .map((i) => i.text)
                .join("")
                .replace(/\s/g, "")
                .includes(label),
            ),
            parts: l.items.length,
            hasMissingGlyph: l.items.some((i) => i.text.includes("�")),
            hasStudentNumber: l.items.some((i) => /\d{8}/.test(i.text)),
            columns: l.items.map((i) => ({
              x: Math.round(i.x),
              length: i.text.length,
            })),
          })),
      }),
    );
  }
} finally {
  await task.destroy();
}
