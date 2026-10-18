import { requireAccount } from "@/server/account-context";
import {
  errorResponse,
  privateHeaders,
  checkMutationOrigin,
  readJson,
} from "@/server/http";
import { runAnalysis, studentWorkspace } from "@/server/academic";
export async function GET(request: Request) {
  try {
    const workspace = await studentWorkspace(
      await requireAccount(request.headers),
    );
    return Response.json(
      { analysis: workspace.analysis },
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
    return Response.json(await runAnalysis(account, await readJson(request)), {
      status: 201,
      headers: privateHeaders,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
