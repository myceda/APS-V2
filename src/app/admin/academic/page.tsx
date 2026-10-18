import Link from "next/link";
import { readPageAccount } from "@/server/page-account";
import { AccountShell, AccountProblem } from "@/components/account-shell";
import { AcademicManager } from "@/components/academic-manager";
import { listDatasets } from "@/server/academic";
export const dynamic = "force-dynamic";
export default async function AcademicPage() {
  const result = await readPageAccount();
  if (!result.account) return <AccountProblem message={result.error!} />;
  if (result.account.role !== "admin")
    return <AccountProblem message="บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลหลักสูตร" />;
  let initial;
  try {
    initial = await listDatasets(result.account);
  } catch {
    return <AccountProblem message="โหลดข้อมูลวิชาการไม่สำเร็จ กรุณาลองใหม่" />;
  }
  return (
    <AccountShell account={result.account}>
      <Link href="/admin/track-criteria">จัดการเกณฑ์เลือกสาย</Link>
      <AcademicManager initial={initial} />
    </AccountShell>
  );
}
