import { requireAccount } from "@/server/account-context";
import { errorResponse, privateHeaders } from "@/server/http";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(
      { account: await requireAccount(request.headers) },
      { headers: privateHeaders },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
