import { readPageAccount } from "@/server/page-account";
import { AccountShell, AccountProblem } from "@/components/account-shell";
import { TrackCriteriaManager } from "@/components/track-criteria-manager";
import { listCriteria } from "@/server/track-criteria";
export const dynamic = "force-dynamic";
export default async function Page() {
  const result = await readPageAccount();
  if (!result.account) return <AccountProblem message={result.error!} />;
  if (result.account.role !== "admin") return <AccountProblem message="บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลหลักสูตร" />;
  let initial;
  try { initial = await listCriteria(result.account); }
  catch { return <AccountProblem message="โหลดเกณฑ์เลือกสายไม่สำเร็จ กรุณาลองใหม่" />; }
  return <AccountShell account={result.account}><TrackCriteriaManager initial={initial} /></AccountShell>;
}
