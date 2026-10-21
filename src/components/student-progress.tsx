"use client";

import { useState } from "react";
import type { AuditResult } from "@/modules/analysis/engine";
import { CATEGORY_NAMES, type Course } from "@/modules/curriculum/types";
import { RelatedDependencies } from "./related-dependencies";
import { COURSE_STATUS_NAMES } from "./student-presenters";
import styles from "./academic-ui.module.css";

export function StudentProgress({ audit, catalogue }: { audit: AuditResult; catalogue: Course[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = 20;
  const rows = audit.courses.filter(course =>
    `${course.code} ${course.name}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) &&
    (status === "all" || course.status === status) && (category === "all" || course.category === category));
  const visibleRows = rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  return <>
    <section className={styles.card} aria-labelledby="progress-heading">
      <h2 id="progress-heading">ความก้าวหน้าตามหมวด</h2>
      <p className={styles.muted}>หน่วยกิตจากผลการเรียนที่ยืนยันแล้ว แยกจากรายวิชาที่อยู่ในแผน</p>
      <div className={styles.groupGrid}>{audit.groups.map(group => <div className={styles.groupItem} key={group.category}>
        <strong>{CATEGORY_NAMES[group.category]}</strong>
        <p>{group.earned}/{group.minimum} หน่วยกิต · {group.status === "unknown" ? "ข้อมูลไม่พอ" : group.remaining ? `ขาด ${group.remaining} หน่วยกิต` : "ครบขั้นต่ำ"}</p>
        <progress aria-label={CATEGORY_NAMES[group.category]} value={Math.min(group.earned, group.minimum)} max={group.minimum || 1} />
      </div>)}</div>
    </section>
    <section className={styles.card} aria-labelledby="progress-courses">
      <h2 id="progress-courses">รายวิชาและจุดที่ต้องติดตาม</h2>
      <div className={styles.form}>
        <label className={styles.field}>ค้นหารหัสหรือชื่อวิชา<input type="search" value={search} onChange={event => { setSearch(event.target.value); setPageIndex(0); }} /></label>
        <label className={styles.field}>สถานะรายวิชา<select value={status} onChange={event => { setStatus(event.target.value); setPageIndex(0); }}><option value="all">ทุกสถานะ</option>{Object.entries(COURSE_STATUS_NAMES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className={styles.field}>หมวดที่แสดง<select value={category} onChange={event => { setCategory(event.target.value); setPageIndex(0); }}><option value="all">ทุกหมวด</option>{Object.entries(CATEGORY_NAMES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <p role="status" className={styles.muted}>พบ {rows.length} รายวิชา{rows.length > 0 && ` · แสดง ${pageIndex * pageSize + 1}–${Math.min((pageIndex + 1) * pageSize, rows.length)}`}</p>
      {!rows.length ? <p className={styles.note}>ไม่พบรายวิชาตามตัวกรอง ลองเปลี่ยนคำค้นหรือเลือกทุกสถานะ</p> : <div className={styles.tableWrap} tabIndex={0} aria-label="ผลตรวจรายวิชาตามหลักสูตร"><table className={`${styles.table} ${styles.courseTable}`}>
        <thead><tr><th>รายวิชา</th><th>หมวด / หน่วยกิต</th><th>ผล / เกรดล่าสุด</th><th>เหตุผลและเงื่อนไข</th></tr></thead>
        <tbody>{visibleRows.map(course => <tr key={course.code}>
          <td>{course.code}<br />{course.name}</td>
          <td>{CATEGORY_NAMES[course.category]} · {course.credits}</td>
          <td><span className={styles.badge} data-status={course.status}>{COURSE_STATUS_NAMES[course.status]}</span><br />{course.latestGrade ?? "ยังไม่มีเกรด"}</td>
          <td>{course.reasons.join("; ") || "ไม่มีข้อสังเกตเพิ่มเติม"}<details className={styles.detail}><summary>เงื่อนไขวิชา {course.code}</summary>{catalogue.find(item => item.code === course.code) && <RelatedDependencies course={catalogue.find(item => item.code === course.code)!} catalogue={catalogue} results={audit.courses} />}</details></td>
        </tr>)}</tbody>
      </table></div>}
      {rows.length > pageSize && <nav className={styles.actions} aria-label="หน้ารายวิชา">
        <button className={styles.secondary} type="button" disabled={pageIndex === 0} onClick={() => setPageIndex(pageIndex - 1)}>รายวิชาก่อนหน้า</button>
        <button className={styles.secondary} type="button" disabled={(pageIndex + 1) * pageSize >= rows.length} onClick={() => setPageIndex(pageIndex + 1)}>รายวิชาถัดไป</button>
      </nav>}
    </section>
  </>;
}
