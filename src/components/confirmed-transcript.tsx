import type { TranscriptPayload } from "@/modules/transcript/types";
import styles from "./academic-ui.module.css";

export function ConfirmedTranscript({ payload, confirmedAt }: { payload: TranscriptPayload; confirmedAt: string }) {
  const fields = [
    ["รหัสนักศึกษา", payload.header.studentCode.value],
    ["ชื่อและนามสกุล", payload.header.studentName.value],
    ["คณะ", payload.header.faculty.value],
    ["ภาควิชา", payload.header.department.value],
    ["ระดับการศึกษา", payload.header.degree.value],
    ["สาขาวิชา", payload.header.program.value],
  ];
  return <section className={styles.card} id="confirmed-transcript" tabIndex={-1} aria-labelledby="confirmed-transcript-title">
    <span className={styles.eyebrow}>ผลการเรียนของคุณ</span>
    <h2 id="confirmed-transcript-title">ผลการเรียนที่บันทึกไว้</h2>
    <p>ข้อมูลจาก PDF ที่คุณตรวจและยืนยันแล้วเมื่อ {new Date(confirmedAt).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" })} การลองปรับแผนจะไม่เปลี่ยนข้อมูลส่วนนี้</p>
    <dl className={styles.identityData}>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "ยังไม่มีข้อมูล"}</dd></div>)}</dl>
    <h3>รายวิชาและผลการเรียน</h3>
    <p className={styles.muted}>{payload.attempts.length} รายการตามใบผลการเรียน รวมวิชาที่เคยเรียนซ้ำ</p>
    <div className={styles.tableWrap} tabIndex={0} aria-label="ผลการเรียนที่ยืนยันแล้ว เลื่อนแนวนอนได้">
      <table className={styles.table}><thead><tr>{["ปี/ภาค", "รหัสวิชา", "ชื่อรายวิชา", "หน่วยกิต", "เกรด", "หน้าใน PDF"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{payload.attempts.map(row => <tr key={row.ordinal}>
          <td>{row.kind === "transfer" ? "เทียบโอน" : row.year && row.semester ? `${row.year}/${row.semester}` : "ยังไม่ทราบภาค"}</td>
          <td>{row.courseCode}</td><td>{row.name}</td><td>{row.credits ?? "ยังไม่ทราบ"}</td><td>{row.grade || "ยังไม่มีเกรด"}</td><td>{row.sourcePage}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
