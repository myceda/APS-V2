import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import type { TranscriptPayload } from "../../src/modules/transcript/types";
const escape = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

// Readable synthetic reference documents for preloaded payloads; not parser fixtures.
export async function referenceDocuments(payloads: Record<string, TranscriptPayload>) {
  const font = await readFile(new URL("../../src/app/fonts/NotoSansThai.ttf", import.meta.url));
  const browser = await chromium.launch({ headless: true });
  const result: Record<string, Buffer> = {};
  try {
    const page = await browser.newPage();
    for (const [key, payload] of Object.entries(payloads)) {
      const header = payload.header;
      await page.setContent(`<html lang="th"><meta charset="utf-8"><style>@font-face{font-family:Thai;src:url(data:font/ttf;base64,${font.toString("base64")})}body{font-family:Thai;font-size:12px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #888;padding:6px}h1{font-size:18px}</style><h1>ข้อมูลสาธิต APS — ไม่ใช่ใบผลการเรียนจากมหาวิทยาลัย</h1><p>เอกสารประกอบ payload ที่เตรียมไว้ ไม่ใช่หลักฐานทดสอบการอ่าน PDF</p><p>ชุด ${escape(key)}</p><p>รหัสนักศึกษา: ${escape(header.studentCode.value)}</p><p>ชื่อ: ${escape(header.studentName.value)}</p><p>คณะ: ${escape(header.faculty.value)}</p><p>ภาควิชา: ${escape(header.department.value)}</p><p>ระดับ: ${escape(header.degree.value)}</p><p>สาขาวิชา: ${escape(header.program.value)}</p><p>สถานะสาย: ${escape(header.trackState)} / ${escape(header.track)}</p><p>ภาค 2568/2 — ข้อมูลสมมติ</p><table><tr><th>รหัส</th><th>รายวิชา</th><th>หน่วยกิต</th><th>เกรดดิบ</th><th>คะแนนสมมติ</th></tr>${payload.attempts.map(a => `<tr><td>${escape(a.courseCode)}</td><td>${escape(a.name)}</td><td>${escape(a.credits)}</td><td>${escape(a.grade)}</td><td>${escape(a.gradePoints)}</td></tr>`).join("")}</table></html>`);
      await page.evaluate(() => document.fonts.ready);
      result[key] = await page.pdf({ format: "A4", printBackground: true, margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" } });
    }
  } finally { await browser.close(); }
  return result;
}
