import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { previewCourseImport } from "./course-import";
import { COURSE_COLUMNS } from "@/modules/curriculum/csv";
import { importCsv, importValues } from "../../tests/support/round-7-admin";

describe("Round 7 import preview", () => {
  it.each(["csv", "xlsx"])("reports mixed rows and preserves valid rows for %s", async ext => {
    const rows = [importValues(), importValues("R7102", "bad")];
    const wb = new ExcelJS.Workbook(); wb.addWorksheet("Synthetic").addRows([COURSE_COLUMNS, ...rows]);
    const bytes = ext === "csv" ? importCsv(rows) : new Uint8Array(await wb.xlsx.writeBuffer());
    const result = await previewCourseImport(bytes, ext);
    expect(result).toMatchObject({ valid: false, accepted: 1, total: 2 });
    expect(result.rows[1]).toMatchObject({ row: 3, course: null });
    expect(result.rows[1].error).toContain("ตัวเลข");
  });
  it("reports actual Excel row numbers after a blank row", async () => {
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("Synthetic");
    ws.addRow(COURSE_COLUMNS); ws.getRow(4).values = importValues("R7101", "bad");
    const result = await previewCourseImport(new Uint8Array(await wb.xlsx.writeBuffer()), "xlsx");
    expect(result.rows).toHaveLength(1); expect(result.rows[0].row).toBe(4);
  });
  it("reports physical CSV lines after blank and multiline rows", async () => {
    const first = importValues(); first[1] = "ข้อมูลสาธิต\nสองบรรทัด";
    const csv = importCsv([first, importValues("R7102", "bad")]).toString().replace("\r\n", "\r\n\r\n");
    const result = await previewCourseImport(Buffer.from(csv), "csv");
    expect(result.rows.map(r => r.row)).toEqual([3, 5]);
  });
  it.each(["csv", "xlsx"])("rejects extra template columns in %s", async ext => {
    const wb = new ExcelJS.Workbook(); wb.addWorksheet("Synthetic").addRows([[...COURSE_COLUMNS, "unexpected"], [...importValues(), "ignored"]]);
    const bytes = ext === "csv" ? Buffer.from([...COURSE_COLUMNS, "unexpected"].join(",") + "\n" + importValues().join(",")) : new Uint8Array(await wb.xlsx.writeBuffer());
    await expect(previewCourseImport(bytes, ext)).rejects.toMatchObject({ code: "IMPORT_HEADERS" });
  });
  it("does not evaluate Excel formulas", async () => {
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("Synthetic"); ws.addRows([COURSE_COLUMNS, importValues()]);
    ws.getCell("C2").value = { formula: "1+2", result: 3 };
    await expect(previewCourseImport(new Uint8Array(await wb.xlsx.writeBuffer()), "xlsx")).rejects.toMatchObject({ code: "IMPORT_FORMULA" });
  });
  it("rejects duplicate codes and accepts corrected reimport", async () => {
    expect((await previewCourseImport(importCsv([importValues(), importValues()]), "csv")).valid).toBe(false);
    expect((await previewCourseImport(importCsv([importValues(), importValues("R7102")]), "csv")).valid).toBe(true);
  });
});
