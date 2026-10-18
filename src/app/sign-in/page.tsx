import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AccountShell } from "@/components/account-shell";
import { GoogleSignIn } from "@/components/auth-actions";
import { isGoogleReady } from "@/server/auth";
import { loginErrorMessage } from "@/modules/accounts/login-errors";
import styles from "@/components/account-shell.module.css";

export const dynamic = "force-dynamic";
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const baseURL = new URL(
    process.env.BETTER_AUTH_URL || "http://localhost:3000",
  );
  const host = (await headers()).get("host");
  if (host && host !== baseURL.host) redirect(`${baseURL.origin}/sign-in`);
  const error = (await searchParams).error;
  const message = loginErrorMessage(error);
  const ready = isGoogleReady();
  return (
    <AccountShell>
      <section className={`${styles.card} ${styles.signInCard}`} aria-labelledby="sign-in-title">
        <span className={styles.eyebrow}>บัญชี APS</span>
        <h1 id="sign-in-title">เข้าสู่ระบบเพื่อเริ่มวางแผนการเรียน</h1>
        <p>กรอกอีเมลมหาวิทยาลัย แล้วเลือกบัญชีเดียวกันใน Google</p>
        {message && <p role="alert" className={styles.error}>{message}</p>}
        {!ready && (
          <p className={styles.note}>
            การเข้าสู่ระบบ Google ยังไม่พร้อม กรุณาติดต่อผู้ดูแล
          </p>
        )}
        <GoogleSignIn ready={ready} />
        <p className={styles.loginHelp}>เข้าใช้ครั้งแรกได้ทันที อัปโหลดใบผลการเรียน แล้วตรวจข้อมูลก่อนเริ่มวางแผน</p>
        <details className={styles.help}><summary>เลือกบัญชีหรือเข้าสู่ระบบไม่ได้?</summary><p>เลือก “ใช้บัญชีอื่น” บนหน้า Google หากไม่พบบัญชีของคุณ ใช้อีเมลหลักของบัญชี ไม่ใช่อีเมลสำรอง หาก Google ปฏิเสธ ให้แจ้งข้อความบนหน้านั้นแก่ผู้ดูแล โดยไม่ส่งรหัสผ่านหรือรหัสยืนยัน</p></details>
      </section>
    </AccountShell>
  );
}
