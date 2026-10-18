"use client";
import { useState } from "react";
import type { EnrollmentRequestSummary } from "@/modules/accounts/types";
import styles from "./account-manager.module.css";

export function EnrollmentReview({
  initialRequests,
}: {
  initialRequests: EnrollmentRequestSummary[];
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function reload() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/enrollment-requests", {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error?.message || "โหลดคำขอไม่สำเร็จ");
        return;
      }
      setRequests(body.requests);
      setMessage("โหลดคำขอล่าสุดแล้ว");
    } catch {
      setError("เชื่อมต่อระบบไม่ได้");
    } finally {
      setBusy(false);
    }
  }
  async function review(
    row: EnrollmentRequestSummary,
    decision: "approved" | "rejected",
  ) {
    setError("");
    setMessage("");
    if (decision === "rejected" && !reasons[row.id]?.trim()) {
      setError("กรุณาระบุเหตุผลที่ให้แก้ไข");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(
        `/api/admin/enrollment-requests/${row.id}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            reason: reasons[row.id] || null,
            expectedVersion: row.version,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        setError(body.error?.message || "ตรวจคำขอไม่สำเร็จ");
        return;
      }
      setRequests((previous) =>
        previous.map((r) => (r.id === row.id ? body.request : r)),
      );
      setMessage(
        decision === "approved"
          ? "ยืนยันข้อมูลนักศึกษาแล้ว นักศึกษาต้องเข้าสู่ระบบใหม่"
          : "ส่งเหตุผลให้นักศึกษาแก้ไขแล้ว",
      );
    } catch {
      setError("เชื่อมต่อระบบไม่ได้ กรุณาโหลดรายการก่อนลองใหม่");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={styles.panel}
      aria-labelledby="review-title"
      aria-busy={busy}
    >
      <h2 id="review-title">ตรวจข้อมูลนักศึกษา</h2>
      <p className={styles.muted}>
        ตรวจรหัสนักศึกษา หลักสูตร และสายกับข้อมูลที่เชื่อถือได้ก่อนยืนยัน
      </p>
      <button className={styles.button} disabled={busy} onClick={reload}>
        {busy ? "กำลังทำงาน…" : "โหลดคำขอล่าสุด"}
      </button>
      <div aria-live="polite">
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {message && <p className={styles.success}>{message}</p>}
      </div>
      {!requests.length && <p>ยังไม่มีคำขอข้อมูลนักศึกษา</p>}
      <ul className={styles.list}>
        {requests.map((row) => (
          <li key={row.id} className={styles.reviewRow}>
            <h3 className={styles.email}>{row.email}</h3>
            {row.submissionReason && <p className={styles.note}>{row.submissionReason}</p>}
            {row.reviewReason && <p className={styles.error}>{row.reviewReason}</p>}
            <dl className={styles.reviewDetails}>
              <dt>รหัสนักศึกษา</dt>
              <dd>{row.studentCode}</dd>
              <dt>หลักสูตร</dt>
              <dd>{row.curriculumCode}</dd>
              <dt>สายการศึกษา</dt>
              <dd>
                {row.trackState === "selected"
                  ? row.trackName
                  : row.trackState === "unknown"
                    ? "ยังไม่ทราบ"
                    : "ยังไม่เลือก"}
              </dd>
              <dt>สถานะ</dt>
              <dd>
                {row.status === "pending"
                  ? "รอตรวจ"
                  : row.status === "approved"
                    ? "ยืนยันแล้ว"
                    : "ให้แก้ไข"}
              </dd>
            </dl>
            {row.status === "pending" ? (
              <>
                <label className={styles.field}>
                  เหตุผลหรือหมายเหตุ
                  <textarea
                    maxLength={500}
                    value={reasons[row.id] || ""}
                    disabled={busy}
                    onChange={(e) =>
                      setReasons((previous) => ({
                        ...previous,
                        [row.id]: e.target.value,
                      }))
                    }
                  />
                </label>
                <div className={styles.actions}>
                  <button
                    className={`${styles.button} ${styles.primary}`}
                    aria-label={`ยืนยันข้อมูล ${row.email}`}
                    disabled={busy}
                    onClick={() => review(row, "approved")}
                  >
                    ยืนยันข้อมูล
                  </button>
                  <button
                    className={styles.button}
                    disabled={busy}
                    aria-label={`ให้แก้ไข ${row.email}`}
                    onClick={() => review(row, "rejected")}
                  >
                    ให้แก้ไข
                  </button>
                </div>
              </>
            ) : (
              row.reviewReason && <p>หมายเหตุ: {row.reviewReason}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
