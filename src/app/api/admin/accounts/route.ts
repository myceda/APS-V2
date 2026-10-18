import { requireAccount } from "@/server/account-context";
import { requireAccountManager } from "@/modules/accounts/guards";
import {
  createAccount,
  curriculumOptions,
  listAccounts,
} from "@/server/accounts";
import {
  checkMutationOrigin,
  errorResponse,
  privateHeaders,
  readJson,
} from "@/server/http";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const context = requireAccountManager(
      await requireAccount(request.headers),
    );
    return Response.json(
      {
        accounts: await listAccounts(context),
        curricula: await curriculumOptions(),
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    checkMutationOrigin(request);
    const context = await requireAccount(request.headers);
    return Response.json(
      { account: await createAccount(context, await readJson(request)) },
      { status: 201, headers: privateHeaders },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
