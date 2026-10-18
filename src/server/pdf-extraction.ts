import "server-only";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { AccessError } from "@/modules/accounts/errors";
import {
  groupLines,
  parseHeader,
  parsePage,
  type TextItem,
  type PageContext,
  TranscriptReadError,
} from "@/modules/transcript/layout";
import type { TranscriptPayload } from "@/modules/transcript/types";

export async function extractPdf(
  content: Uint8Array,
): Promise<TranscriptPayload> {
  if (
    content.byteLength > 10 * 1024 * 1024 ||
    Buffer.from(content.subarray(0, 5)).toString() !== "%PDF-"
  )
    throw new AccessError(
      422,
      "PDF_INVALID",
      "กรุณาเลือก PDF ขนาดไม่เกิน 10 MB",
    );
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const require = createRequire(import.meta.url);
  // Resolve at runtime; a direct require.resolve call is replaced by a module
  // number in Turbopack, which cannot be passed to pathToFileURL.
  const locateModule = require.resolve.bind(require);
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    locateModule("pdfjs-dist/legacy/build/pdf.worker.mjs"),
  ).href;
  const task = pdfjs.getDocument({
    data: new Uint8Array(content),
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });
  let document;
  const timer = setTimeout(() => {
    void task.destroy().catch(() => undefined);
  }, 30_000);
  try {
    document = await task.promise;
    if (document.numPages > 30)
      throw new AccessError(
        422,
        "PDF_PAGE_LIMIT",
        "รองรับใบรายงานผลไม่เกิน 30 หน้า",
      );
    let context: PageContext = { kind: "unknown", year: null, semester: null },
      items = 0;
    const attempts: TranscriptPayload["attempts"] = [],
      summaries: TranscriptPayload["summaries"] = [];
    let header: TranscriptPayload["header"] | undefined;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber),
        text = await page.getTextContent();
      const textItems = text.items.filter(
        (item): item is typeof item & TextItem => "str" in item,
      );
      items += textItems.length;
      if (items > 150_000)
        throw new AccessError(
          422,
          "PDF_TEXT_LIMIT",
          "เอกสารมีข้อมูลเกินที่รองรับ",
        );
      const lines = groupLines(textItems);
      if (pageNumber === 1) header = parseHeader(lines);
      const parsed = parsePage(
        lines,
        page.getViewport({ scale: 1 }).width,
        pageNumber,
        context,
        attempts.length,
      );
      attempts.push(...parsed.attempts);
      summaries.push(...parsed.summaries);
      context = parsed.context;
      page.cleanup();
    }
    if (!items)
      throw new AccessError(
        422,
        "PDF_NO_TEXT",
        "ไฟล์ไม่มีชั้นข้อความ ระบบยังไม่รองรับ OCR กรุณาใช้ PDF ข้อความจากทะเบียน",
      );
    if (!attempts.length || !header)
      throw new AccessError(
        422,
        "PDF_LAYOUT_UNSUPPORTED",
        "ไม่พบตารางผลการเรียนตามรูปแบบที่รองรับ",
      );
    return { header, attempts, summaries, pages: document.numPages };
  } catch (error) {
    if (error instanceof AccessError) throw error;
    if (error instanceof TranscriptReadError)
      throw new AccessError(422, error.code, error.message);
    throw new AccessError(
      422,
      "PDF_READ_FAILED",
      "อ่าน PDF ไม่สำเร็จ ไฟล์อาจเสียหาย มีรหัสผ่าน หรือใช้รูปแบบที่ยังไม่รองรับ",
    );
  } finally {
    clearTimeout(timer);
    await task.destroy();
  }
}
