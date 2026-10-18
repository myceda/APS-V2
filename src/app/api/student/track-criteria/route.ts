import { requireAccount } from "@/server/account-context";
import { errorResponse, privateHeaders } from "@/server/http";
import { studentCriteria } from "@/server/track-criteria";
import { AccessError } from "@/modules/accounts/errors";
export async function GET(request: Request) {
  try {
    const account = await requireAccount(request.headers), q = new URL(request.url).searchParams;
    const year = Number(q.get("year")), semester = Number(q.get("semester"));
    if (!Number.isInteger(year) || year < 2500 || year > 2700 || ![1, 2, 3].includes(semester)) throw new AccessError(422, "TERM_INVALID", "กรุณาระบุปีการศึกษาและภาคเรียน");
    return Response.json(await studentCriteria(account, { year, semester }), { headers: privateHeaders });
  } catch (error) { return errorResponse(error); }
}
