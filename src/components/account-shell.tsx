import Link from "next/link";
import type { AccountContext } from "@/modules/accounts/types";
import { SignOut } from "./auth-actions";
import styles from "./account-shell.module.css";
import { demoEnabled, DEMO_NOTICE } from "@/modules/demo/config";
import { AccountSessionGuard } from "./account-session-guard";

export function AccountShell({
  account,
  children,
}: {
  account?: AccountContext;
  children: React.ReactNode;
}) {
  const demo = demoEnabled();
  const shell = (
    <div className={styles.shell}>
      {demo && <p className={styles.demoNotice} role="note">{DEMO_NOTICE}</p>}
      <a href="#account-content">ข้ามไปเนื้อหาหลัก</a>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          APS
        </Link>
        <nav className={styles.nav} aria-label="เมนูบัญชี">
          <Link href="/">หน้าเริ่มต้น</Link>
          {account?.role === "student" && (
            <Link href="/student">ผลการเรียนและแผน</Link>
          )}
          {account?.role === "admin" && (
            <Link href="/admin">หลักสูตรของฉัน</Link>
          )}
          {account?.role === "admin" && (
            <Link href="/admin/academic">ข้อมูลวิชาการ</Link>
          )}
          {account?.canManageAccounts && (
            <Link href="/admin/accounts">จัดการบัญชี</Link>
          )}
          {account && <SignOut />}
        </nav>
      </header>
      {account && (
        <p className={styles.signedInIdentity}>
          {demo ? "บัญชีสาธิต" : "บัญชี Google ที่เข้าสู่ระบบ"}: <strong>{account.email}</strong>
        </p>
      )}
      <main id="account-content" tabIndex={-1}>
        {children}
      </main>
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
