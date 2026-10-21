import { readPageAccount } from "@/server/page-account";
import { requireStudentAccount } from "@/modules/accounts/guards";
import { AccessError } from "@/modules/accounts/errors";
import { AccountProblem, AccountShell } from "@/components/account-shell";
import { studentWorkspace } from "@/server/academic";
import { StudentWorkspace } from "@/components/student-workspace";

export const dynamic = "force-dynamic";
export default async function StudentPage() {
  const result = await readPageAccount();
  if (!result.account) return <AccountProblem message={result.error!} />;
  let workspace;
  try {
    requireStudentAccount(result.account);
    workspace = await studentWorkspace(result.account);
  } catch (error) {
    return <AccountProblem message={error instanceof AccessError ? error.message : "โหลดข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง"} />;
  }
  return (
    <AccountShell account={result.account} studentInitialView={workspace.drafts.length || !workspace.revision ? "transcript" : "overview"}>
      <StudentWorkspace initial={workspace} />
    </AccountShell>
  );
}
