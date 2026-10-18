import { requireAccount } from "@/server/account-context";
import { updateAccount } from "@/server/accounts";
import {
  checkMutationOrigin,
  errorResponse,
  privateHeaders,
  readJson,
} from "@/server/http";

export const dynamic = "force-dynamic";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkMutationOrigin(request);
    const context = await requireAccount(request.headers);
    return Response.json(
      {
        account: await updateAccount(
          context,
          (await params).id,
          await readJson(request),
        ),
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
