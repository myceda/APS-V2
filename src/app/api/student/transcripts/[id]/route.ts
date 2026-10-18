import { requireAccount } from "@/server/account-context";
import {
  errorResponse,
  privateHeaders,
  checkMutationOrigin,
  readJson,
} from "@/server/http";
import { cancelDraft, getDraft, saveDraft } from "@/server/academic";
import { integer, record } from "@/modules/curriculum/validation";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    return Response.json(
      await getDraft(
        await requireAccount(request.headers),
        (await context.params).id,
      ),
      { headers: privateHeaders },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const account = await requireAccount(request.headers);
    checkMutationOrigin(request);
    return Response.json(
      await saveDraft(
        account,
        (await context.params).id,
        await readJson(request, 1_048_576),
      ),
      { headers: privateHeaders },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const account = await requireAccount(request.headers);
    checkMutationOrigin(request);
    const input = record(await readJson(request));
    return Response.json(
      await cancelDraft(
        account,
        (await context.params).id,
        integer(input.expectedVersion, 1, 1_000_000),
      ),
      { headers: privateHeaders },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
