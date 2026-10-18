import { requireAccount } from "@/server/account-context";
import {
  errorResponse,
  privateHeaders,
  checkMutationOrigin,
  readJson,
} from "@/server/http";
import { readUpload } from "@/server/uploads";
import {
  reviseTranscript,
  studentWorkspace,
  uploadTranscript,
} from "@/server/academic";
import { record } from "@/modules/curriculum/validation";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    return Response.json(
      await studentWorkspace(await requireAccount(request.headers)),
      { headers: privateHeaders },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const context = await requireAccount(request.headers);
    if (request.headers.get("content-type")?.startsWith("application/json")) {
      checkMutationOrigin(request);
      const input = record(await readJson(request));
      if (input.action !== "revise")
        return Response.json(
          { error: { message: "คำสั่งไม่รองรับ" } },
          { status: 422, headers: privateHeaders },
        );
      return Response.json(await reviseTranscript(context), {
        status: 201,
        headers: privateHeaders,
      });
    }
    const { content } = await readUpload(request);
    return Response.json(await uploadTranscript(context, content), {
      status: 201,
      headers: privateHeaders,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
