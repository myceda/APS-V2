import { redirect } from "next/navigation";
import { readPageAccount } from "@/server/page-account";
import { AccountProblem } from "@/components/account-shell";

export const dynamic = "force-dynamic";
export default async function AccountPage() {
  const result = await readPageAccount();
  if (!result.account) return <AccountProblem message={result.error!} />;
  redirect(result.account.role === "admin" ? "/admin" : "/student");
}
