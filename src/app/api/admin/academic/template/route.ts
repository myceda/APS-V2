import ExcelJS from "exceljs";
import { requireAccount } from "@/server/account-context";
import { errorResponse, privateHeaders } from "@/server/http";
import { COURSE_COLUMNS } from "@/modules/curriculum/csv";
import { AccessError } from "@/modules/accounts/errors";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const context = await requireAccount(request.headers);
    if (context.role !== "admin" || !context.curriculumIds.length)
      throw new AccessError(
        403,
        "ADMIN_REQUIRED",
        "ต้องมีสิทธิ์ผู้ดูแลหลักสูตร",
      );
    if (new URL(request.url).searchParams.get("format") === "xlsx") {
      const workbook = new ExcelJS.Workbook(),
        sheet = workbook.addWorksheet("รายวิชา");
      sheet.addRow(COURSE_COLUMNS);
      sheet.columns.forEach((c) => (c.width = 24));
      const buffer = await workbook.xlsx.writeBuffer();
      return new Response(new Uint8Array(buffer), {
        headers: {
          ...privateHeaders,
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="aps-courses.xlsx"',
        },
      });
    }
    return new Response("\uFEFF" + COURSE_COLUMNS.join(",") + "\r\n", {
      headers: {
        ...privateHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="aps-courses.csv"',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
