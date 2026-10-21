import Link from "next/link";
import type { AccountContext } from "@/modules/accounts/types";
import { SignOut } from "./auth-actions";
import styles from "./account-shell.module.css";
import { demoEnabled, DEMO_NOTICE } from "@/modules/demo/config";
import { AccountSessionGuard } from "./account-session-guard";
import { ContentStartLink } from "./content-start-link";
import { WorkspaceNavigation } from "./workspace-navigation";
import type { StudentView } from "./student-navigation";

export function AccountShell({
  account,
  children,
  studentInitialView,
}: {
  account?: AccountContext;
  children: React.ReactNode;
  studentInitialView?: StudentView;
}) {
  const demo = demoEnabled();
  const home = account?.role === "admin" ? "/admin" : account?.role === "student" ? "/student" : "/";
  const shell = (
    <div className={`${styles.shell} ${account ? styles.authenticated : ""}`}>
      {demo && <p className={styles.demoNotice} role="note">{DEMO_NOTICE}</p>}
      <ContentStartLink className={styles.skipLink}>ข้ามไปเนื้อหาหลัก</ContentStartLink>
      <header className={styles.header}>
        <Link className={styles.brand} href={home}>
          APS
        </Link>
        <nav className={styles.nav} aria-label="เมนูบัญชี">
          <Link href={home}>หน้าเริ่มต้น</Link>
          {account && <span className={styles.roleLabel}>{account.role === "student" ? "วางแผนการเรียน" : "จัดการข้อมูลวิชาการ"}</span>}
          {account && <SignOut />}
        </nav>
      </header>
      <div className={account ? styles.workspaceLayout : undefined}>
      {account && <WorkspaceNavigation role={account.role} canManageAccounts={account.canManageAccounts} initialView={studentInitialView} />}
      <div className={styles.workspaceContent}>
      {account && (
        <p className={styles.signedInIdentity}>
          {demo ? "กำลังทดลองในบทบาท" : "บัญชี Google ที่เข้าสู่ระบบ"}: <strong>{demo ? account.role === "student" ? "นักศึกษา" : "ผู้ดูแล" : account.email}</strong>
        </p>
      )}
      <main id="account-content" tabIndex={-1}>
        {children}
      </main>
      <footer className={styles.footer}><ContentStartLink>กลับขึ้นด้านบน</ContentStartLink></footer>
      </div>
      </div>
    </div>
  );
  return account ? (
    <AccountSessionGuard accountId={account.accountId} role={account.role}>
      {shell}
    </AccountSessionGuard>
  ) : shell;
}

export function AccountProblem({ message }: { message: string }) {
  return (
    <AccountShell>
      <section className={styles.card}>
        <h1>ยังเข้าใช้งานส่วนนี้ไม่ได้</h1>
        <p className={styles.error}>{message}</p>
        <Link href="/sign-in">กลับไปหน้าเข้าสู่ระบบ</Link>
      </section>
    </AccountShell>
  );
}
