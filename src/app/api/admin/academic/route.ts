import { requireAccount } from "@/server/account-context";
import {
  errorResponse,
  privateHeaders,
  checkMutationOrigin,
  readJson,
} from "@/server/http";
import {
  createDataset,
  listDatasets,
  publishDataset,
  saveDataset,
} from "@/server/academic";
import { integer, record, text } from "@/modules/curriculum/validation";
export async function GET(request: Request) {
  try {
    return Response.json(
      await listDatasets(await requireAccount(request.headers)),
      { headers: privateHeaders },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const account = await requireAccount(request.headers);
    checkMutationOrigin(request);
    const input = record(await readJson(request, 4_194_304));
    if (input.action === "create")
      return Response.json(
        await createDataset(
          account,
          text(input.versionId, 100),
          input.copyId ? text(input.copyId, 100) : undefined,
        ),
        { status: 201, headers: privateHeaders },
      );
    if (input.action === "save")
      return Response.json(
        await saveDataset(account, text(input.id, 100), input),
        { headers: privateHeaders },
      );
    if (input.action === "publish")
      return Response.json(
        await publishDataset(
          account,
          text(input.id, 100),
          integer(input.expectedVersion, 1, 1_000_000),
        ),
        { headers: privateHeaders },
      );
    return Response.json(
      { error: { message: "คำสั่งไม่รองรับ" } },
      { status: 422, headers: privateHeaders },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
