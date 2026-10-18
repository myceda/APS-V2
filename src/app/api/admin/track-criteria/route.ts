import { requireAccount } from "@/server/account-context";
import { checkMutationOrigin, errorResponse, privateHeaders, readJson } from "@/server/http";
import { criteriaHistory, listCriteria, mutateCriteria, cohortRecord, confirmCohort } from "@/server/track-criteria";
import { record, text } from "@/modules/curriculum/validation";
import { AccessError } from "@/modules/accounts/errors";
export async function GET(request: Request) {
  try {
    const account = await requireAccount(request.headers), q = new URL(request.url).searchParams;
    const result = q.has("history") ? await criteriaHistory(account, text(q.get("history"), 100)) : q.has("studentCode") ? await cohortRecord(account, text(q.get("versionId"), 100), text(q.get("studentCode"), 30)) : await listCriteria(account);
    return Response.json(result, { headers: privateHeaders });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const account = await requireAccount(request.headers);
    checkMutationOrigin(request);
    let input: Record<string, unknown>;
    try { input = record(await readJson(request, 100_000)); } catch { throw new AccessError(422, "CRITERIA_INVALID", "รูปแบบข้อมูลไม่ถูกต้อง"); }
    return Response.json(input.action === "cohort" ? await confirmCohort(account, input) : await mutateCriteria(account, input), { headers: privateHeaders });
  } catch (error) {
    if (error instanceof Error && error.constructor === Error) return errorResponse(new AccessError(422, "CRITERIA_INVALID", error.message));
    return errorResponse(error);
  }
}
