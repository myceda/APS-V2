import "server-only";
import ExcelJS from "exceljs";
import { COURSE_COLUMNS, parseCsv } from "@/modules/curriculum/csv";
import { parseCourse } from "@/modules/curriculum/validation";
import type { Course } from "@/modules/curriculum/types";
import { AccessError } from "@/modules/accounts/errors";
export async function previewCourseImport(
  content: Uint8Array,
  extension: string,
) {
  let rows: string[][];
  if (extension === "csv")
    rows = parseCsv(new TextDecoder("utf-8", { fatal: true }).decode(content));
  else if (extension === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      Buffer.from(content) as unknown as Parameters<
        typeof workbook.xlsx.load
      >[0],
    );
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount > 2001 || sheet.columnCount > 20)
      throw new AccessError(
        422,
        "IMPORT_SIZE",
        "Excel ต้องมีแผ่นงานแรกไม่เกิน 2,000 รายการและ 20 คอลัมน์",
      );
    rows = [];
    sheet.eachRow((row) =>
      rows.push(
        Array.from({ length: COURSE_COLUMNS.length }, (_, i) => {
          const cell = row.getCell(i + 1);
          if (cell.type === ExcelJS.ValueType.Formula)
            throw new AccessError(
              422,
              "IMPORT_FORMULA",
              "ใช้ค่าข้อมูลโดยตรง ไม่รองรับสูตร Excel ในแม่แบบนำเข้า",
            );
          return cell.text;
        }),
      ),
    );
  } else
    throw new AccessError(
      422,
      "IMPORT_EXTENSION",
      "รองรับ CSV UTF-8 และ Excel .xlsx ตามแม่แบบ",
    );
  const header = rows.shift()?.map((s) => s.trim());
  if (!header || COURSE_COLUMNS.some((name, i) => header[i] !== name))
    throw new AccessError(
      422,
      "IMPORT_HEADERS",
      "ชื่อและลำดับคอลัมน์ไม่ตรงแม่แบบ กรุณาดาวน์โหลดแม่แบบก่อน",
    );
  const preview: {
    row: number;
    course: Course | null;
    error: string | null;
  }[] = [];
  const seen = new Set<string>();
  const boolean = (value: string) => {
    if (!["true", "false", "1", "0", ""].includes(value))
      throw new Error("ค่าจริง/เท็จใช้ true/false หรือ 1/0");
    return ["true", "1"].includes(value);
  };
  for (const [index, values] of rows.entries()) {
    try {
      if (values.length !== COURSE_COLUMNS.length)
        throw new Error("จำนวนคอลัมน์ไม่ตรงแม่แบบ");
      const v = Object.fromEntries(
        COURSE_COLUMNS.map((name, i) => [name, values[i].trim()]),
      );
      const course = parseCourse({
        code: v.code,
        name: v.name,
        credits: v.credits.trim() === "" ? NaN : Number(v.credits),
        category: v.category,
        tracks: v.tracks ? v.tracks.split(";") : [],
        grading: v.grading,
        specific: boolean(v.specific),
        prerequisite: {
          mode: v.prerequisite_mode || "all",
          courses: v.prerequisite_courses
            ? v.prerequisite_courses.split(";")
            : [],
          concurrent: boolean(v.concurrent),
          unresolved: null,
        },
        requiresConsent: boolean(v.requires_consent),
        source: v.source,
      });
      if (seen.has(course.code))
        throw new Error(`รหัส ${course.code} ซ้ำในไฟล์`);
      seen.add(course.code);
      preview.push({ row: index + 2, course, error: null });
    } catch (error) {
      preview.push({
        row: index + 2,
        course: null,
        error: error instanceof Error ? error.message : "อ่านแถวไม่ได้",
      });
    }
  }
  return {
    rows: preview,
    valid: preview.every((r) => !r.error),
    accepted: preview.filter((r) => !r.error).length,
    total: preview.length,
  };
}
