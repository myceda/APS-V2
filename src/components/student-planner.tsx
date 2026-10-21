"use client";

import { useRef, useState } from "react";
import type { AuditResult } from "@/modules/analysis/engine";
import type { TrackPlan } from "@/modules/planning/engine";
import { TRACK_NAMES, type Course } from "@/modules/curriculum/types";
import { RelatedDependencies } from "./related-dependencies";
import { termName } from "./student-presenters";
import styles from "./academic-ui.module.css";

export function StudentPlanner({ plan, audit, catalogue }: { plan: TrackPlan; audit: AuditResult; catalogue: Course[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useRef<HTMLElement>(null);
  const course = catalogue.find(item => item.code === selected);
  const planned = plan.terms.flatMap(term => term.courses).find(item => item.code === selected);
  function showCourse(code: string) {
    setSelected(code);
    requestAnimationFrame(() => detail.current?.focus());
  }
  return <section className={styles.card} id="student-plan" tabIndex={-1}>
    <h2>แผนการเรียน · {TRACK_NAMES[plan.track]}</h2>
    <p className={styles.note}>ภาคคาดจบ: {termName(plan.graduationTerm)} · {plan.basis === "alternative" ? "เป็นทางเลือก ยังไม่เปลี่ยนสายจริง" : "ภายใต้ข้อมูลและสมมติฐานชุดนี้"}</p>
    <div className={styles.plannerLayout}>
      <div className={styles.termTimeline}>
        {!plan.terms.some(term => term.courses.length) && <p className={styles.note}>ยังไม่มีภาคที่จัดรายวิชาได้ ตรวจข้อมูลเปิดสอนและเหตุผลของวิชาที่ติดก่อน หรือสร้างแผนภายใต้สมมติฐานที่ระบุ</p>}
        {plan.terms.filter(term => term.courses.length).map(term => <article className={styles.term} key={termName(term.term)}>
          <div className={styles.termHeading}><h3>{termName(term.term)}</h3><span className={styles.badge}>{term.credits} หน่วยกิต</span></div>
          <p className={styles.muted}>GPAX สมมติ {term.projectedGpax?.toFixed(2) ?? "—"}</p>
          {term.courses.map(item => <button type="button" key={item.code} className={styles.courseButton} aria-pressed={selected === item.code} aria-controls="planner-course-details" onClick={() => showCourse(item.code)}><span><strong>{item.code}</strong> · {item.name}</span><small>{item.credits} หน่วยกิต · เกรดสมมติ {item.grade}</small></button>)}
        </article>)}
        {plan.blocked.length > 0 && <details className={styles.detail}><summary>วิชาที่ยังจัดไม่ได้ · {plan.blocked.length} วิชา</summary><ul className={styles.list}>{plan.blocked.map(item => <li key={item.code}><button type="button" className={styles.textButton} onClick={() => showCourse(item.code)} aria-controls="planner-course-details">ดูวิชา {item.code}</button>: {item.reasons.join("; ")}</li>)}</ul></details>}
        <details className={styles.detail}><summary>ดูสรุปรายปี</summary>{[...new Set(plan.terms.map(term => term.term.year))].map(year => <p key={year}>ปี {year}: {plan.terms.filter(term => term.term.year === year).reduce((sum, term) => sum + term.credits, 0)} หน่วยกิต จากภาคในแผนชุดเดียวกัน</p>)}</details>
      </div>
      <aside id="planner-course-details" ref={detail} tabIndex={-1} className={styles.planDetails} aria-label="รายละเอียดวิชาในแผน">
        <h3>{course ? `${course.code} · ${course.name}` : "รายละเอียดและเงื่อนไข"}</h3>
        {course ? <><p>{course.credits} หน่วยกิต · {planned ? `เกรดสมมติ ${planned.grade}` : "ยังจัดลงแผนไม่ได้"}</p><RelatedDependencies course={course} catalogue={catalogue} results={audit.courses} />{planned && <ul className={styles.list}>{[...planned.reasons, ...planned.assumptions].map((text, index) => <li key={index}>{text}</li>)}</ul>}<p className={styles.muted}>แหล่งอ้างอิงรายวิชา: {course.source || "ยังไม่ระบุ"}</p></> : <p className={styles.muted}>เลือกรายวิชาในแผน เพื่อดูวิชาบังคับก่อน วิชาที่ต่อเนื่อง และเหตุผลที่จัดไว้ในภาคนั้น</p>}
        <details className={styles.detail}><summary>สมมติฐานและเหตุผลที่ยังคาดจบไม่ได้</summary><ul className={styles.list}>{[...plan.assumptions, ...plan.limitations].map((text, index) => <li key={index}>{text}</li>)}</ul>{!plan.assumptions.length && !plan.limitations.length && <p>ไม่มีรายการเพิ่มเติมในผลชุดนี้</p>}</details>
      </aside>
    </div>
  </section>;
}
