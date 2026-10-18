import type { Course } from "@/modules/curriculum/types";
import type { CourseResult } from "@/modules/analysis/engine";
import styles from "./academic-ui.module.css";
export function RelatedDependencies({
  course,
  catalogue,
  results,
}: {
  course: Course;
  catalogue: Course[];
  results: CourseResult[];
}) {
  const parents = course.prerequisite.courses
    .map((code) => catalogue.find((c) => c.code === code))
    .filter((c): c is Course => Boolean(c));
  const children = catalogue.filter((c) =>
    c.prerequisite.courses.includes(course.code),
  );
  const status = (code: string) =>
    ({
      passed: "ผ่านแล้ว",
      failed: "ยังไม่ผ่าน",
      pending: "รอผล",
      missing: "ยังต้องเรียน",
      unknown: "ข้อมูลไม่พอ",
    })[results.find((c) => c.code === code)?.status ?? "unknown"];
  const colors = (code: string) =>
    results.find((c) => c.code === code)?.status === "passed"
      ? "#d1fae5"
      : "#fff7ed";
  const visible = parents.slice(0, 4);
  return (
    <section
      className={styles.detail}
      aria-label={`เงื่อนไขของ ${course.code}`}
    >
      <p>
        {parents.length
          ? `ต้องผ่าน${course.prerequisite.mode === "any" ? "อย่างน้อยหนึ่งวิชา" : "ทุกวิชา"}${course.prerequisite.concurrent ? " หรือเรียนพร้อมกันตามเงื่อนไขที่ระบุ" : "ก่อน"}`
          : "ไม่มีวิชาบังคับก่อนในชุดข้อมูลนี้"}
      </p>
      {visible.length > 0 && (
        <svg className={styles.graph} viewBox="0 0 640 220" aria-hidden="true">
          <defs>
            <marker
              id={`arrow-${course.code}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#526179" />
            </marker>
          </defs>
          {visible.map((parent, index) => {
            const x = (640 / (visible.length + 1)) * (index + 1);
            return (
              <g key={parent.code}>
                <path
                  d={`M ${x} 76 L 320 145`}
                  stroke="#526179"
                  strokeWidth="2"
                  fill="none"
                  markerEnd={`url(#arrow-${course.code})`}
                />
                <rect
                  x={x - 62}
                  y="20"
                  width="124"
                  height="56"
                  rx="8"
                  fill={colors(parent.code)}
                  stroke="#9baecb"
                />
                <text
                  x={x}
                  y="43"
                  textAnchor="middle"
                  fill="#172b4d"
                  fontSize="15"
                >
                  {parent.code}
                </text>
                <text
                  x={x}
                  y="64"
                  textAnchor="middle"
                  fill="#526179"
                  fontSize="12"
                >
                  {status(parent.code)}
                </text>
              </g>
            );
          })}
          <rect
            x="240"
            y="148"
            width="160"
            height="52"
            rx="8"
            fill="#edf3ff"
            stroke="#1d4ed8"
          />
          <text
            x="320"
            y="180"
            textAnchor="middle"
            fill="#172b4d"
            fontSize="16"
          >
            {course.code}
          </text>
        </svg>
      )}
      <ul className={styles.list}>
        {parents.map((parent) => (
          <li key={parent.code}>
            {parent.code} · {parent.name} — {status(parent.code)}
          </li>
        ))}
      </ul>
      {parents.length > 4 && (
        <p className={styles.muted}>
          ภาพแสดงสี่วิชาแรก รายการข้อความแสดงเงื่อนไขครบ
        </p>
      )}
      {children.length > 0 && (
        <p>วิชาที่ต่อเนื่อง: {children.map((c) => c.code).join(", ")}</p>
      )}
      {course.prerequisite.unresolved && (
        <p className={styles.note}>{course.prerequisite.unresolved}</p>
      )}
      {course.requiresConsent && (
        <p className={styles.note}>
          ต้องตรวจความยินยอมจากผู้มีอำนาจ ไม่ถือว่าผู้ดูแล APS
          อนุมัติลงทะเบียนแทนได้
        </p>
      )}
      <p className={styles.muted}>แหล่งกฎ: {course.source}</p>
    </section>
  );
}
