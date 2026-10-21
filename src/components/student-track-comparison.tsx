import { TRACK_NAMES, type StudyTrack } from "@/modules/curriculum/types";
import { termName, type StudentAnalysis } from "./student-presenters";
import styles from "./academic-ui.module.css";

export function StudentTrackComparison({ analysis, stale, onOpen }: { analysis: StudentAnalysis; stale: boolean; onOpen: (track: StudyTrack) => void }) {
  return <section className={styles.card} aria-labelledby="compare-heading">
    <h2 id="compare-heading">เปรียบเทียบสหกิจศึกษาและโครงงานวิจัย</h2>
    <p>ใช้ผลการเรียนและหลักสูตรฉบับเดียวกัน การเปิดดูแผนไม่เปลี่ยนสายที่ผูกกับบัญชี</p>
    <p className={styles.muted}>หลักสูตรฉบับ {analysis.datasetVersion} · {stale ? "ผลฐานล้าสมัย กรุณาคำนวณใหม่" : "ผลฐานปัจจุบัน"}</p>
    {analysis.trackState === "selected" && <p className={styles.note}>คุณเลือกสายแล้ว ระบบแสดงเฉพาะแผนสายปัจจุบัน จึงไม่มีผลอีกสายให้เปรียบเทียบ</p>}
    <div className={styles.comparisonGrid}>{analysis.plans.map(plan => {
      const audit = analysis.audits.find(item => item.track === plan.track);
      if (!audit) return null;
      return <article key={plan.track} className={styles.trackCard} aria-label={`ทางเลือก${TRACK_NAMES[plan.track]}`}>
        <span className={styles.eyebrow}>{plan.basis === "alternative" ? "แผนทางเลือก" : "แผนสายปัจจุบัน"}</span>
        <h3>{TRACK_NAMES[plan.track]}</h3>
        <dl className={styles.comparisonDetails}>
          <div><dt>ภาคคาดจบ</dt><dd>{termName(plan.graduationTerm)}</dd></div>
          <div><dt>หน่วยกิตที่ผ่าน</dt><dd>{audit.earnedCredits}</dd></div>
          <div><dt>หน่วยกิตที่ยังขาดตามหมวด</dt><dd>{audit.groups.some(group => group.status === "unknown") ? "ข้อมูลยังไม่ครบ" : audit.groups.reduce((sum, group) => sum + group.remaining, 0)}</dd></div>
          <div><dt>รายวิชาในหลักสูตรที่ยังไม่มีผลผ่าน</dt><dd>{audit.courses.filter(course => course.status !== "passed").length} วิชา</dd></div>
          <div><dt>วิชาที่ยังจัดไม่ได้</dt><dd>{plan.blocked.length} วิชา</dd></div>
        </dl>
        <button type="button" className={styles.primary} onClick={() => onOpen(plan.track)}>เปิดแผน{TRACK_NAMES[plan.track]}</button>
        <p className={styles.muted}>รวมตัวเลือกวิชาเลือก ไม่ใช่จำนวนวิชาที่ต้องลงทะเบียนทั้งหมด ดูหน่วยกิตที่ยังขาดตามหมวดประกอบ</p>
        <details className={styles.detail}><summary>รายวิชาและตัวเลือกที่ยังไม่มีผลผ่าน</summary><ul className={styles.list}>{audit.courses.filter(course => course.status !== "passed").map(course => <li key={course.code}>{course.code} · {course.name}</li>)}</ul></details>
        <details className={styles.detail}><summary>สมมติฐานและข้อจำกัด</summary><ul className={styles.list}>{[...plan.assumptions, ...plan.limitations].map((text, index) => <li key={index}>{text}</li>)}</ul>{!plan.assumptions.length && !plan.limitations.length && <p>ไม่มีรายการเพิ่มเติมในผลชุดนี้ ยังต้องตรวจตารางเปิดสอนจริง</p>}</details>
      </article>;
    })}</div>
  </section>;
}
