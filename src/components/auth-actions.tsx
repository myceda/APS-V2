"use client";
import { useState } from "react";
import { createAuthClient } from "better-auth/react";
import styles from "./account-shell.module.css";

const authClient = createAuthClient();

export function GoogleSignIn({ ready }: { ready: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      // A cancelled/failed account switch must not leave the previous APS
      // identity active and make its student context look like the new account.
      const signedOut = await authClient.signOut();
      if (signedOut.error) {
        setError("ออกจากบัญชีเดิมไม่สำเร็จ กรุณาลองใหม่ก่อนเปลี่ยนบัญชี");
        setBusy(false);
        return;
      }
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/account",
        errorCallbackURL: "/sign-in",
        loginHint: email.trim().toLowerCase(),
      });
      if (result.error) {
        setError("ไม่สามารถเริ่มเข้าสู่ระบบได้ กรุณาลองใหม่หรือติดต่อผู้ดูแล");
        setBusy(false);
      }
    } catch {
      setError("เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่");
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={signIn}
      className={styles.signInForm}
      aria-label="เข้าสู่ระบบ Google"
      aria-busy={busy}
    >
      <label className={styles.loginEmail}>
        อีเมล Google ที่ต้องการเข้าใช้
        <input
          type="email"
          autoComplete="email"
          name="loginEmail"
          placeholder="yourname@silpakorn.edu"
          spellCheck={false}
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={!ready || busy}
        />
      </label>
      <p className={styles.loginHelp}>
        ใช้ @silpakorn.edu และเลือกบัญชีให้ตรงกับอีเมลนี้
      </p>
      <button className={`${styles.button} ${styles.primaryButton}`} type="submit" disabled={!ready || busy}>
        {busy ? "กำลังพาไป Google…" : "เข้าสู่ระบบด้วย Google"}
      </button>
      <div aria-live="polite">
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </div>
    </form>
  );
}

export function SignOut() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError("ออกจากระบบไม่สำเร็จ กรุณาลองใหม่");
        setBusy(false);
        return;
      }
      window.location.replace("/sign-in");
    } catch {
      setError("เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่");
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className={styles.button}
        type="button"
        onClick={signOut}
        disabled={busy}
      >
        {busy ? "กำลังออกจากระบบ…" : "ออกจากระบบ"}
      </button>
      <span role="status">{error}</span>
    </>
  );
}
