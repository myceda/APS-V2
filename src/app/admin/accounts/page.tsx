import { readPageAccount } from "@/server/page-account";
import { requireAccountManager } from "@/modules/accounts/guards";
import { AccessError } from "@/modules/accounts/errors";
import { curriculumOptions, listAccounts } from "@/server/accounts";
import { AccountProblem, AccountShell } from "@/components/account-shell";
import { AccountManager } from "@/components/account-manager";
import { EnrollmentReview } from "@/components/enrollment-review";
import { listEnrollmentRequests } from "@/server/enrollment-requests";
import type {
  AccountSummary,
  CurriculumOption,
  EnrollmentRequestSummary,
} from "@/modules/accounts/types";

export const dynamic = "force-dynamic";
export default async function AccountsPage() {
  const result = await readPageAccount();
  if (!result.account) return <AccountProblem message={result.error!} />;
  let accounts: AccountSummary[];
  let curricula: CurriculumOption[];
  let requests: EnrollmentRequestSummary[];
  try {
    requireAccountManager(result.account);
    [accounts, curricula, requests] = await Promise.all([
      listAccounts(result.account),
      curriculumOptions(),
      listEnrollmentRequests(result.account),
    ]);
  } catch (error) {
    return (
      <AccountProblem
        message={
          error instanceof AccessError
            ? error.message
            : "โหลดบัญชีไม่สำเร็จ กรุณาลองใหม่"
        }
      />
    );
  }
  return (
    <AccountShell account={result.account}>
      <AccountManager initialAccounts={accounts} curricula={curricula} />
      <EnrollmentReview initialRequests={requests} />
    </AccountShell>
  );
}
