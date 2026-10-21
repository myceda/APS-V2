"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { Role } from "@/modules/accounts/types";
import styles from "./account-shell.module.css";
import { SESSION_RECHECK } from "./use-unsaved-changes";

// Server authorization remains authoritative. This also prevents the browser's
// restored route from showing a previous account while its session has changed.
export function AccountSessionGuard({
  accountId,
  role,
  children,
}: {
  accountId: string;
  role: Role;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [verifiedPath, setVerifiedPath] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [expired, setExpired] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let mounted = true;
    let sequence = 0;
    let controller: AbortController | undefined;
    async function verify() {
      const request = ++sequence;
      controller?.abort();
      const current = new AbortController();
      controller = current;
      setVerifiedPath(null);
      setFailed(false);
      setExpired(false);
      const timeout = window.setTimeout(() => current.abort(), 10_000);
      try {
        const response = await fetch("/api/me", {
          credentials: "same-origin",
          cache: "no-store",
          signal: current.signal,
        });
        if (!mounted || request !== sequence) return;
        if (response.status === 401 || response.status === 403) {
          // Keep drafts only in this mounted tab, hidden from an unauthenticated
          // session. Reauthentication must prove the same identity before reveal.
          setExpired(true);
          return;
        }
        if (!response.ok) throw new Error("SESSION_CHECK_UNAVAILABLE");
        const data = await response.json();
        if (!mounted || request !== sequence) return;
        if (typeof data.account?.accountId !== "string" || typeof data.account?.role !== "string")
          throw new Error("SESSION_CHECK_UNAVAILABLE");
        if (data.account.accountId !== accountId || data.account.role !== role) {
          window.location.reload();
          return;
        }
        setVerifiedPath(pathname);
      } catch {
        if (mounted && request === sequence) setFailed(true);
      } finally {
        window.clearTimeout(timeout);
      }
    }
    // Initial/path checks are asynchronous; restored pages also recheck on the
    // browser lifecycle events that can reuse a previously rendered route.
    void Promise.resolve().then(verify);
    const recheck = () => { void verify(); };
    const onVisible = () => { if (document.visibilityState === "visible") recheck(); };
    window.addEventListener("popstate", recheck);
    window.addEventListener(SESSION_RECHECK, recheck);
    window.addEventListener("pageshow", recheck);
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mounted = false;
      controller?.abort();
      window.removeEventListener("popstate", recheck);
      window.removeEventListener(SESSION_RECHECK, recheck);
      window.removeEventListener("pageshow", recheck);
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [accountId, role, pathname, retry]);

  const verified = verifiedPath === pathname;
  return (
    <>
      {!verified && (expired ? (
        <div className={styles.shell}><section role="alert" className={styles.card}>
          <h1>กลับเข้าสู่ระบบเพื่อทำงานต่อ</h1>
          <p>การเข้าสู่ระบบใช้ไม่ได้แล้ว ข้อมูลที่ยังไม่บันทึกถูกเก็บไว้ในแท็บนี้และซ่อนไว้</p>
          <p>เข้าสู่ระบบด้วยบัญชีเดิมในแท็บอื่น แล้วกลับมาตรวจบัญชีอีกครั้ง อย่ารีเฟรชหรือปิดแท็บนี้ก่อนบันทึกข้อมูล</p>
          <div className={styles.nav}>
            <a href="/sign-in" target="_blank" rel="noreferrer">เข้าสู่ระบบใหม่ในแท็บอื่น</a>
            <button className={styles.button} type="button" onClick={() => setRetry(value => value + 1)}>ลองตรวจบัญชีอีกครั้ง</button>
          </div>
        </section></div>
      ) : failed ? (
        <div className={styles.shell}><section role="alert" className={styles.card}>
          <p>ตรวจสอบบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง</p>
          <button className={styles.button} type="button" onClick={() => { setFailed(false); setRetry((value) => value + 1); }}>
            ลองตรวจบัญชีอีกครั้ง
          </button>
        </section></div>
      ) : <p className={styles.shell} role="status">กำลังตรวจสอบบัญชี…</p>)}
      {/* Keep forms mounted while rechecking so unchanged accounts retain edits. */}
      <div hidden={!verified} inert={!verified}>{children}</div>
    </>
  );
}
