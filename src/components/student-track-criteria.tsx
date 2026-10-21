"use client";
import { useEffect, useState } from "react";
import { ELIGIBILITY_NAMES } from "@/modules/track-criteria/types";
import { TRACK_NAMES } from "@/modules/curriculum/types";
import type { studentCriteria } from "@/server/track-criteria";
import styles from "./academic-ui.module.css";
export function StudentTrackCriteria({ year, semester, revisionId }: { year: number; semester: number; revisionId?: string }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof studentCriteria>> | null>(null);
  const [error, setError] = useState(""), [refresh, setRefresh] = useState(0);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  useEffect(() => {
    const markPrevious = () => setNeedsRefresh(true);
    const visibleAgain = () => { if (document.visibilityState === "visible") markPrevious(); };
    window.addEventListener("focus", markPrevious);
    document.addEventListener("visibilitychange", visibleAgain);
    return () => {
      window.removeEventListener("focus", markPrevious);
      document.removeEventListener("visibilitychange", visibleAgain);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/student/track-criteria?year=${year}&semester=${semester}`, { cache: "no-store", signal: controller.signal })
      .then(async r => { const body = await r.json(); if (!r.ok) throw new Error(body.error?.message || "โหลดเกณฑ์ไม่สำเร็จ"); return body; })
      .then(body => { if (!controller.signal.aborted) { setResult(body); setError(""); setNeedsRefresh(false); } })
      .catch(e => { if (!controller.signal.aborted) { setResult(null); setError(e.message); } });
    return () => controller.abort();
  }, [year, semester, revisionId, refresh]);
  return <section className={styles.card} aria-label="สิทธิ์เลือกสายเบื้องต้น">
    <h2>ตรวจเกณฑ์เลือกสายเบื้องต้น</h2>
    <p>รอบ {year}/{semester} · ใช้ผลการเรียนจริงที่ยืนยันแล้ว ไม่ใช้เกรดจาก What-if</p>
    <p className={styles.note}><strong>การอนุมัติจากภาควิชา: ยังไม่มีหลักฐานยืนยันใน APS</strong><br />ผลตรวจเบื้องต้น สายที่บัญชีระบุ และแผนทางเลือก ไม่ใช่การอนุมัติให้ลงทะเบียน</p>
    {needsRefresh && result && <p role="status" className={styles.note}>นี่คือผลที่ตรวจไว้ก่อนหน้า ผู้ดูแลอาจเปลี่ยนเกณฑ์หรือฉบับข้อมูลระหว่างที่คุณออกจากหน้านี้ กรุณาตรวจเกณฑ์ล่าสุดอีกครั้งก่อนใช้ผล</p>}
    {error ? <p role="alert">{error}</p> : !result ? <p role="status">กำลังตรวจเกณฑ์…</p> : <>
      <p>ปีที่เข้าศึกษาที่ผู้ดูแลยืนยัน: {result.admissionYear ?? "รอข้อมูลจากผู้ดูแล"}</p>
      {result.results.map(r => <div key={r.track}><h3>{TRACK_NAMES[r.track]} — {ELIGIBILITY_NAMES[r.status]}</h3>
        {r.criteriaId && <p>เกณฑ์ฉบับ {r.criteriaVersion} · รหัสอ้างอิง {r.criteriaId}</p>}
        <ul>{r.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul></div>)}
      <p className={styles.muted}>ตรวจล่าสุด {new Date(result.evaluatedAt).toLocaleString("th-TH")}</p>
    </>}
    <p>หากยังไม่เลือกสาย ยังดูแผนโครงงานวิจัยและสหกิจศึกษาเพื่อเปรียบเทียบได้ การไม่มีเกณฑ์จะไม่เลือกสายให้เอง</p>
    <button className={styles.secondary} onClick={() => { setResult(null); setError(""); setRefresh(n => n + 1); }}>ตรวจเกณฑ์ล่าสุดอีกครั้ง</button>
  </section>;
}
