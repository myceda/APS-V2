"use client";
import { useEffect, useState } from "react";
import { ELIGIBILITY_NAMES } from "@/modules/track-criteria/types";
import { TRACK_NAMES } from "@/modules/curriculum/types";
import type { studentCriteria } from "@/server/track-criteria";
import styles from "./academic-ui.module.css";
export function StudentTrackCriteria({ year, semester, revisionId }: { year: number; semester: number; revisionId?: string }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof studentCriteria>> | null>(null);
  const [error, setError] = useState(""), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/student/track-criteria?year=${year}&semester=${semester}`, { cache: "no-store", signal: controller.signal })
      .then(async r => { const body = await r.json(); if (!r.ok) throw new Error(body.error?.message || "โหลดเกณฑ์ไม่สำเร็จ"); return body; })
      .then(body => { setResult(body); setError(""); })
      .catch(e => { if (!controller.signal.aborted) { setResult(null); setError(e.message); } });
    return () => controller.abort();
  }, [year, semester, revisionId, refresh]);
  return <section className={styles.card} aria-label="สิทธิ์เลือกสายเบื้องต้น">
    <h2>ตรวจเกณฑ์เลือกสายเบื้องต้น</h2>
    <p>รอบ {year}/{semester} · ใช้ผลการเรียนจริงที่ยืนยันแล้ว ไม่ใช้เกรดจาก What-if</p>
    <p className={styles.note}><strong>การอนุมัติจากภาควิชา: ยังไม่มีหลักฐานยืนยันใน APS</strong><br />ผลตรวจเบื้องต้น สายที่บัญชีระบุ และแผนทางเลือก ไม่ใช่การอนุมัติให้ลงทะเบียน</p>
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
