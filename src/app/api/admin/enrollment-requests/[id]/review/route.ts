import { requireAccount } from "@/server/account-context";
import { reviewEnrollmentRequest } from "@/server/enrollment-requests";
import {
  checkMutationOrigin,
  errorResponse,
  privateHeaders,
  readJson,
} from "@/server/http";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkMutationOrigin(request);
    const context = await requireAccount(request.headers);
    const { id } = await params;
    return Response.json(
      {
        request: await reviewEnrollmentRequest(
          context,
          id,
          await readJson(request),
        ),
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
