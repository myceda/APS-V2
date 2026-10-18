import { requireAccount } from "@/server/account-context";
import { curriculumOptions } from "@/server/accounts";
import {
  getOwnEnrollmentRequest,
  saveEnrollmentRequest,
} from "@/server/enrollment-requests";
import {
  checkMutationOrigin,
  errorResponse,
  privateHeaders,
  readJson,
} from "@/server/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const context = await requireAccount(request.headers);
    return Response.json(
      {
        request: await getOwnEnrollmentRequest(context),
        onboardingStatus: context.onboardingStatus,
        curricula: await curriculumOptions(),
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PUT(request: Request) {
  try {
    checkMutationOrigin(request);
    const context = await requireAccount(request.headers);
    return Response.json(
      {
        request: await saveEnrollmentRequest(context, await readJson(request)),
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
