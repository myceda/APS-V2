"use client";
import { useRef, useState } from "react";
import type {
  AccountInput,
  AccountSummary,
  CurriculumOption,
} from "@/modules/accounts/types";
import styles from "./account-manager.module.css";

function emptyForm(curricula: CurriculumOption[]): AccountInput {
  return {
    email: "",
    role: "student",
    status: "active",
    curriculumIds: [],
    studentCode: "",
    curriculumVersionId: curricula[0]?.versions[0]?.id ?? "",
    trackState: "unknown",
    trackId: null,
  };
}

export function AccountManager({
  initialAccounts,
  curricula,
}: {
  initialAccounts: AccountSummary[];
  curricula: CurriculumOption[];
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [editing, setEditing] = useState<AccountSummary | null>(null);
  const [form, setForm] = useState<AccountInput>(() => emptyForm(curricula));
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [provideEnrollment, setProvideEnrollment] = useState(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const currentVersion = curricula
    .flatMap((curriculum) => curriculum.versions)
    .find((version) => version.id === form.curriculumVersionId);
  const identityLocked = Boolean(editing?.bound);
  const studentLocked = identityLocked && Boolean(editing?.enrollment);

  function setField<K extends keyof AccountInput>(
    key: K,
    value: AccountInput[K],
  ) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }
  function startNew() {
    setProvideEnrollment(true);
    setEditing(null);
    setForm(emptyForm(curricula));
    setError("");
    setSuccess("");
    heading.current?.focus();
  }
  function edit(account: AccountSummary) {
    setProvideEnrollment(Boolean(account.enrollment));
    setEditing(account);
    setError("");
    setSuccess("");
    setForm({
      email: account.email,
      role: account.role,
      status: account.status,
      curriculumIds: account.curriculumIds,
      studentCode: account.enrollment?.studentCode ?? "",
      curriculumVersionId:
        account.enrollment?.curriculumVersionId ??
        curricula[0]?.versions[0]?.id ??
        "",
      trackState: account.enrollment?.trackState ?? "unknown",
      trackId: account.enrollment?.trackId ?? null,
      expectedVersion: account.version,
    });
    heading.current?.focus();
  }
  async function refreshAccounts() {
    setRefreshing(true);
    setError("");
    try {
      const response = await fetch("/api/admin/accounts", {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error?.message || "โหลดรายการไม่สำเร็จ");
        return;
      }
      setAccounts(result.accounts);
      setSuccess(
        editing
          ? "โหลดรายการล่าสุดแล้ว เลือกแก้ไขบัญชีอีกครั้งเพื่อใช้ฉบับล่าสุด"
          : "โหลดรายการล่าสุดแล้ว",
      );
    } catch {
      setError("เชื่อมต่อระบบไม่ได้ ข้อมูลในฟอร์มยังคงอยู่");
    } finally {
      setRefreshing(false);
    }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const input = {
      ...form,
      curriculumIds: form.role === "admin" ? form.curriculumIds : [],
      studentCode:
        form.role === "student" && provideEnrollment ? form.studentCode : null,
      curriculumVersionId:
        form.role === "student" && provideEnrollment
          ? form.curriculumVersionId
          : null,
      trackState:
        form.role === "student" && provideEnrollment
          ? form.trackState
          : "unknown",
      trackId:
        form.role === "student" &&
        provideEnrollment &&
        form.trackState === "selected"
          ? form.trackId
          : null,
    };
    try {
      const response = await fetch(
        editing ? `/api/admin/accounts/${editing.id}` : "/api/admin/accounts",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        setError(result.error?.message || "บันทึกไม่สำเร็จ กรุณาตรวจข้อมูล");
        return;
      }
      const saved = result.account as AccountSummary;
      setAccounts((previous) =>
        editing
          ? previous.map((account) =>
              account.id === saved.id ? saved : account,
            )
          : [...previous, saved],
      );
      setEditing(null);
      setProvideEnrollment(true);
      setForm(emptyForm(curricula));
      setSuccess("บันทึกบัญชีแล้ว หากแก้สิทธิ์ ผู้ใช้นั้นต้องเข้าสู่ระบบใหม่");
    } catch {
      setError(
        "เชื่อมต่อระบบไม่ได้ ข้อมูลในฟอร์มยังคงอยู่ กรุณาโหลดรายการก่อนลองบันทึกใหม่",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.layout}>
      <section className={styles.panel} aria-labelledby="accounts-title">
        <h1 id="accounts-title">จัดการบัญชีและสิทธิ์</h1>
        <p className={styles.muted}>
          บัญชีมหาวิทยาลัยเข้าใช้ได้เอง เพิ่มบัญชีภายนอกหรือแก้สิทธิ์ได้จากหน้านี้
        </p>
        <div className={styles.actions}>
          <button className={styles.button} onClick={startNew} disabled={busy}>
            เพิ่มบัญชี
          </button>
          <button
            className={styles.button}
            onClick={refreshAccounts}
            disabled={refreshing || busy}
          >
            {refreshing ? "กำลังโหลด…" : "โหลดรายการล่าสุด"}
          </button>
        </div>
        <h2>รายการบัญชี ({accounts.length})</h2>
        {!accounts.length && <p>ยังไม่มีบัญชีในรายการ</p>}
        <ul className={styles.list}>
          {accounts.map((account) => (
            <li className={styles.row} key={account.id}>
              <div className={styles.identity}>
                <span className={styles.email}>{account.email}</span>
                <div className={styles.badges}>
                  {account.enrollment && <span>{account.enrollment.confirmationSource === "student_confirmed" ? "นักศึกษายืนยันจากเอกสาร" : "ผู้ดูแลตรวจข้อมูลแล้ว"}</span>}
                  <span>
                    {account.canManageAccounts
                      ? "ผู้ดูแลหลัก"
                      : account.role === "admin"
                        ? "ผู้ดูแลหลักสูตร"
                        : "นักศึกษา"}
                  </span>
                  {account.role === "student" && !account.enrollment && (
                    <span>ยังไม่มีข้อมูลนักศึกษา</span>
                  )}
                  <span>
                    {account.status === "active" ? "เปิดใช้งาน" : "ระงับบัญชี"}
                  </span>
                  <span>
                    {account.bound
                      ? "ผูก Google แล้ว"
                      : "รอเข้าสู่ระบบครั้งแรก"}
                  </span>
                </div>
              </div>
              {account.canManageAccounts ? (
                <span className={styles.muted}>ล็อกสิทธิ์บัญชีหลัก</span>
              ) : (
                <button
                  className={styles.button}
                  aria-label={`แก้ไขบัญชี ${account.email}`}
                  onClick={() => edit(account)}
                  disabled={busy}
                >
                  แก้ไข
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className={styles.panel}>
        <h2 ref={heading} tabIndex={-1}>
          {editing ? "แก้ไขบัญชี" : "เพิ่มบัญชีใหม่"}
        </h2>
        <form
          className={styles.form}
          onSubmit={save}
          aria-busy={busy}
          aria-label="ข้อมูลบัญชี"
        >
          <label className={styles.field}>
            อีเมล Google
            <input
              name="email"
              type="email"
              autoComplete="off"
              value={form.email}
              onChange={(event) => setField("email", event.target.value)}
              required
              maxLength={254}
              disabled={identityLocked || busy}
            />
            {identityLocked && <small>บัญชีที่ผูกแล้วเปลี่ยนอีเมลไม่ได้</small>}
          </label>
          <label className={styles.field}>
            บทบาท
            <select
              value={form.role}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  role: event.target.value as AccountInput["role"],
                  curriculumIds:
                    event.target.value === "admin"
                      ? previous.curriculumIds.length
                        ? previous.curriculumIds
                        : curricula.map((curriculum) => curriculum.id)
                      : [],
                }))
              }
              disabled={busy}
            >
              <option value="student">นักศึกษา</option>
              <option value="admin">ผู้ดูแลหลักสูตร</option>
            </select>
          </label>
          <label className={styles.field}>
            สถานะบัญชี
            <select
              value={form.status}
              onChange={(event) =>
                setField("status", event.target.value as AccountInput["status"])
              }
              disabled={busy}
            >
              <option value="active">เปิดใช้งาน</option>
              <option value="inactive">ระงับบัญชี</option>
            </select>
          </label>
          {form.role === "admin" ? (
            <fieldset className={styles.checks} disabled={busy}>
              <legend>หลักสูตรที่มอบหมาย</legend>
              {curricula.map((curriculum) => (
                <label key={curriculum.id}>
                  <input
                    type="checkbox"
                    checked={form.curriculumIds.includes(curriculum.id)}
                    onChange={(event) =>
                      setField(
                        "curriculumIds",
                        event.target.checked
                          ? [...form.curriculumIds, curriculum.id]
                          : form.curriculumIds.filter(
                              (id) => id !== curriculum.id,
                            ),
                      )
                    }
                  />
                  {curriculum.code}
                </label>
              ))}
            </fieldset>
          ) : (
            <>
              <label className={styles.field}>
                <span>
                  <input
                    type="checkbox"
                    checked={provideEnrollment}
                    disabled={
                      busy ||
                      Boolean(editing?.enrollment) ||
                      (identityLocked && !editing?.enrollment)
                    }
                    onChange={(e) => setProvideEnrollment(e.target.checked)}
                  />{" "}
                  บันทึกข้อมูลนักศึกษาที่ตรวจสอบแล้ว
                </span>
              </label>
              {!provideEnrollment && (
                <p className={styles.muted}>
                  บัญชีเข้าได้และกรอกข้อมูลเพื่อรอตรวจ
                  ยืนยันผ่านรายการตรวจข้อมูลนักศึกษา
                </p>
              )}
              {provideEnrollment && (
                <>
                  <label className={styles.field}>
                    รหัสนักศึกษาที่ตรวจแล้ว
                    <input
                      name="studentCode"
                      value={form.studentCode || ""}
                      onChange={(event) =>
                        setField("studentCode", event.target.value)
                      }
                      required
                      maxLength={32}
                      disabled={studentLocked || busy}
                    />
                    <small>
                      ใช้ข้อมูลที่ผู้ดูแลตรวจแล้ว ไม่อนุมานจากอีเมลหรือ PDF
                    </small>
                  </label>
                  <label className={styles.field}>
                    ฉบับหลักสูตร
                    <select
                      value={form.curriculumVersionId || ""}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          curriculumVersionId: event.target.value,
                          trackId: null,
                          trackState: "unknown",
                        }))
                      }
                      required
                      disabled={studentLocked || busy}
                    >
                      <option value="">เลือกฉบับหลักสูตร</option>
                      {curricula.flatMap((curriculum) =>
                        curriculum.versions.map((version) => (
                          <option value={version.id} key={version.id}>
                            {curriculum.code} · ฉบับร่างสำหรับผูกบัญชี
                          </option>
                        )),
                      )}
                    </select>
                  </label>
                  <label className={styles.field}>
                    สถานะสายการศึกษา
                    <select
                      value={form.trackState}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          trackState: event.target
                            .value as AccountInput["trackState"],
                          trackId: null,
                        }))
                      }
                      disabled={busy}
                    >
                      <option value="unknown">ยังไม่ทราบ</option>
                      <option value="not_selected">
                        ยืนยันว่า ยังไม่เลือก
                      </option>
                      <option value="selected">เลือกสายแล้ว</option>
                    </select>
                  </label>
                  {form.trackState === "selected" && (
                    <label className={styles.field}>
                      สายที่ยืนยัน
                      <select
                        value={form.trackId || ""}
                        onChange={(event) =>
                          setField("trackId", event.target.value)
                        }
                        required
                        disabled={busy}
                      >
                        <option value="">เลือกสาย</option>
                        {currentVersion?.tracks.map((track) => (
                          <option value={track.id} key={track.id}>
                            {track.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </>
              )}
            </>
          )}
          <div aria-live="polite">
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
            {success && <p className={styles.success}>{success}</p>}
          </div>
          <div className={styles.actions}>
            <button
              className={`${styles.button} ${styles.primary}`}
              type="submit"
              disabled={busy}
            >
              {busy
                ? "กำลังบันทึก…"
                : editing
                  ? "บันทึกการแก้ไข"
                  : "บันทึกบัญชีใหม่"}
            </button>
            {editing && (
              <button
                className={styles.button}
                type="button"
                onClick={startNew}
                disabled={busy}
              >
                ยกเลิกการแก้ไข
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
