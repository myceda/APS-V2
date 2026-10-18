"use client";
import { useState } from "react";
import type {
  CurriculumOption,
  EnrollmentRequestSummary,
  TrackState,
} from "@/modules/accounts/types";
import styles from "./account-manager.module.css";

export function EnrollmentForm({
  initialRequest,
  curricula,
}: {
  initialRequest: EnrollmentRequestSummary | null;
  curricula: CurriculumOption[];
}) {
  const [request, setRequest] = useState(initialRequest);
  const [code, setCode] = useState(initialRequest?.studentCode ?? "");
  const [versionId, setVersionId] = useState(
    initialRequest?.curriculumVersionId ?? "",
  );
  const [trackState, setTrackState] = useState<TrackState>(
    initialRequest?.trackState ?? "unknown",
  );
  const [trackId, setTrackId] = useState(initialRequest?.trackId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const currentVersion = curricula
    .flatMap((c) => c.versions)
    .find((v) => v.id === versionId);
  async function reload() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/me/enrollment-request", {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error?.message || "โหลดข้อมูลไม่สำเร็จ");
        return;
      }
      if (body.onboardingStatus === "complete") {
        window.location.reload();
        return;
      }
      const latest: EnrollmentRequestSummary | null = body.request;
      setRequest(latest);
      setCode(latest?.studentCode ?? "");
      setVersionId(latest?.curriculumVersionId ?? "");
      setTrackState(latest?.trackState ?? "unknown");
      setTrackId(latest?.trackId ?? "");
      setMessage("โหลดข้อมูลล่าสุดแล้ว");
    } catch {
      setError("เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/me/enrollment-request", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentCode: code,
          curriculumVersionId: versionId,
          trackState,
          trackId: trackState === "selected" ? trackId : null,
          expectedVersion: request?.version ?? 0,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error?.message || "ส่งข้อมูลไม่สำเร็จ");
        return;
      }
      setRequest(body.request);
      setMessage("ส่งข้อมูลแล้ว รอผู้ดูแลหลักยืนยัน");
    } catch {
      setError("เชื่อมต่อระบบไม่ได้ ข้อมูลในฟอร์มยังคงอยู่");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.panel} aria-labelledby="enrollment-title">
      <h1 id="enrollment-title">ยืนยันข้อมูลนักศึกษา</h1>
      <p>
        เข้าสู่ระบบสำเร็จแล้ว กรอกข้อมูลครั้งแรกเพื่อให้ผู้ดูแลหลักตรวจ
        ก่อนใช้ฟีเจอร์วิชาการ
      </p>
      <p className={styles.muted}>
        ขณะนี้รองรับเฉพาะ CS2565 หากเรียนหลักสูตรอื่นให้ติดต่อผู้ดูแล
        ไม่เลือกหลักสูตรแทนข้อมูลจริง
      </p>
      <p role="status">
        {request?.status === "pending"
          ? "สถานะ: รอผู้ดูแลยืนยัน — ยังแก้ข้อมูลที่ส่งได้"
          : request?.status === "rejected"
            ? "สถานะ: กรุณาแก้ไขข้อมูลแล้วส่งใหม่"
            : "สถานะ: ยังไม่ได้ส่งข้อมูล"}
      </p>
      {request?.status === "rejected" && (
        <p className={styles.error}>เหตุผล: {request.reviewReason}</p>
      )}
      <form
        className={styles.form}
        aria-label="ข้อมูลนักศึกษาสำหรับตรวจ"
        aria-busy={busy}
        onSubmit={save}
      >
        <label className={styles.field}>
          รหัสนักศึกษา
          <input
            required
            maxLength={32}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={busy}
            autoComplete="off"
          />
        </label>
        <label className={styles.field}>
          ฉบับหลักสูตร
          <select
            required
            value={versionId}
            disabled={busy}
            onChange={(e) => {
              setVersionId(e.target.value);
              setTrackState("unknown");
              setTrackId("");
            }}
          >
            <option value="">เลือกหลักสูตรของคุณ</option>
            {curricula.flatMap((c) =>
              c.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {c.code} · ฉบับร่างสำหรับผูกบัญชี
                </option>
              )),
            )}
          </select>
        </label>
        <label className={styles.field}>
          สถานะสายการศึกษา
          <select
            value={trackState}
            disabled={busy}
            onChange={(e) => {
              setTrackState(e.target.value as TrackState);
              setTrackId("");
            }}
          >
            <option value="unknown">ยังไม่ทราบ</option>
            <option value="not_selected">ยังไม่เลือก</option>
            <option value="selected">เลือกสายแล้ว</option>
          </select>
        </label>
        {trackState === "selected" && (
          <label className={styles.field}>
            สายการศึกษา
            <select
              required
              value={trackId}
              disabled={busy}
              onChange={(e) => setTrackId(e.target.value)}
            >
              <option value="">เลือกสาย</option>
              {currentVersion?.tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div aria-live="polite">
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          {message && <p className={styles.success}>{message}</p>}
        </div>
        <div className={styles.actions}>
          <button
            className={`${styles.button} ${styles.primary}`}
            disabled={busy}
          >
            {busy
              ? "กำลังส่ง…"
              : request?.status === "pending"
                ? "บันทึกข้อมูลที่แก้ไข"
                : "ส่งข้อมูลให้ตรวจ"}
          </button>
          <button
            type="button"
            className={styles.button}
            disabled={busy}
            onClick={reload}
          >
            ตรวจสถานะล่าสุด
          </button>
        </div>
      </form>
    </section>
  );
}
