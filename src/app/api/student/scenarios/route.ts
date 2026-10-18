import { requireAccount } from "@/server/account-context";
import {
  errorResponse,
  privateHeaders,
  checkMutationOrigin,
  readJson,
} from "@/server/http";
import { runScenario } from "@/server/academic";
export async function POST(request: Request) {
  try {
    const account = await requireAccount(request.headers);
    checkMutationOrigin(request);
    return Response.json(await runScenario(account, await readJson(request)), {
      status: 201,
      headers: privateHeaders,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
