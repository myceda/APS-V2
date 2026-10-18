import { requireAccount } from "@/server/account-context";
import {
  errorResponse,
  privateHeaders,
  checkMutationOrigin,
  readJson,
} from "@/server/http";
import { confirmDraft } from "@/server/academic";
import { integer, record } from "@/modules/curriculum/validation";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const account = await requireAccount(request.headers);
    checkMutationOrigin(request);
    const input = record(await readJson(request));
    return Response.json(
      await confirmDraft(
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
