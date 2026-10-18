import { requireAccount } from "@/server/account-context";
import { getDataset } from "@/server/academic";
import { errorResponse, privateHeaders } from "@/server/http";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    return Response.json(await getDataset(await requireAccount(request.headers), (await context.params).id), { headers: privateHeaders });
  } catch (error) { return errorResponse(error); }
}
