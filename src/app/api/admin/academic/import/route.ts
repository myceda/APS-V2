import { requireAccount } from "@/server/account-context";
import { requireCurriculumAdmin } from "@/modules/accounts/guards";
import { errorResponse, privateHeaders } from "@/server/http";
import { readUpload } from "@/server/uploads";
import { getDatabase } from "@/server/database";
import { previewCourseImport } from "@/server/course-import";
import { AccessError } from "@/modules/accounts/errors";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const account = await requireAccount(request.headers),
      { content, file, form } = await readUpload(request, 2 * 1024 * 1024);
    const dataset = await getDatabase().academicDataset.findUnique({
      where: { id: String(form.get("datasetId")) },
      include: { curriculumVersion: true },
    });
    if (!dataset)
      throw new AccessError(404, "DATASET_NOT_FOUND", "ไม่พบชุดข้อมูล");
    requireCurriculumAdmin(account, dataset.curriculumVersion.curriculumId);
    return Response.json(
      await previewCourseImport(
        content,
        file.name.split(".").at(-1)?.toLowerCase() ?? "",
      ),
      { headers: privateHeaders },
    );
  } catch (error) {
    return errorResponse(
      error instanceof AccessError
        ? error
        : new AccessError(
            422,
            "IMPORT_INVALID",
            "อ่านไฟล์นำเข้าไม่สำเร็จ กรุณาตรวจแม่แบบและใช้ค่าข้อมูลโดยตรง",
          ),
    );
  }
}
