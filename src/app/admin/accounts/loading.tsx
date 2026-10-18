import { AccountShell } from "@/components/account-shell";
import styles from "@/components/account-shell.module.css";

export default function AccountsLoading() {
  return (
    <AccountShell>
      <section className={styles.card}>
        <h1>จัดการบัญชีและสิทธิ์</h1>
        <p role="status">กำลังตรวจสิทธิ์และโหลดรายการบัญชี…</p>
      </section>
    </AccountShell>
  );
}
