"use client";
import { useState, type FormEvent } from "react";
import type { studentWorkspace, AcademicResult } from "@/server/academic";
import type { DraftView } from "@/modules/transcript/types";
import { GRADES } from "@/modules/transcript/types";
import { transcriptIssues } from "@/modules/transcript/validation";
import {
  CATEGORY_NAMES,
  TRACK_NAMES,
  type StudyTrack,
} from "@/modules/curriculum/types";
import { sameParameters, type PlanningParameters } from "@/modules/planning/engine";
import type { simulate, ScenarioEvent } from "@/modules/simulation/engine";
import { StudentTrackCriteria } from "./student-track-criteria";
import { RelatedDependencies } from "./related-dependencies";
import styles from "./academic-ui.module.css";
type Workspace = Awaited<ReturnType<typeof studentWorkspace>>;
const headerNames = {
  studentCode: "รหัสนักศึกษาในเอกสาร",
  studentName: "ชื่อและนามสกุล",
  faculty: "คณะ",
  department: "ภาควิชา",
  degree: "ระดับการศึกษา",
  program: "สาขาวิชา",
};
const statusNames = {
  passed: "ผ่านแล้ว",
  failed: "ยังไม่ผ่าน",
  pending: "รอผล",
  missing: "ยังต้องเรียน",
  unknown: "ข้อมูลไม่พอ",
};
const termName = (term: { year: number; semester: number } | null) =>
  term
    ? `${term.year}/${term.semester}${term.semester === 3 ? " (ฤดูร้อน)" : ""}`
    : "ยังคาดไม่ได้";
async function request<T>(
  url: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error?.message || "ทำรายการไม่สำเร็จ กรุณาลองใหม่");
  return result;
}
export function StudentWorkspace({ initial }: { initial: Workspace }) {
  const [workspace, setWorkspace] = useState(initial),
    [tab, setTab] = useState(initial.revision ? 1 : 0);
  const [draft, setDraft] = useState<DraftView | null>(
      initial.drafts[0] ?? null,
    ),
    [draftDirty, setDraftDirty] = useState(false);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [reviewed, setReviewed] = useState(false),
    [onlyProblems, setOnlyProblems] = useState(false);
  const [parameters, setParameters] = useState<PlanningParameters>(
    initial.analysis?.result.parameters ?? {
      currentTerm: { year: 2569, semester: 1 },
      normalLoad: 12,
      summerLoad: 6,
      horizon: 24,
      targetGrade: "B",
      assumeUnknownOfferings: false,
    },
  );
  const [parametersDirty, setParametersDirty] = useState(false),
    [track, setTrack] = useState<StudyTrack>(
      initial.analysis?.result.plans[0]?.track ?? "project",
    );
  const [eventAction, setEventAction] = useState<
      ScenarioEvent["action"] | "offering_open" | "offering_closed"
    >("drop"),
    [eventCode, setEventCode] = useState(""),
    [eventTerm, setEventTerm] = useState("2569/1"),
    [eventGrade, setEventGrade] = useState("B");
  const [comparison, setComparison] = useState<ReturnType<
    typeof simulate
  > | null>(null);
  const analysis = workspace.analysis?.result,
    audit =
      analysis?.audits.find((a) => a.track === track) ?? analysis?.audits[0],
    plan = analysis?.plans.find((p) => p.track === track) ?? analysis?.plans[0];
  const issues = draft ? transcriptIssues(draft, workspace.enrollment) : [];
  const parametersDiffer = Boolean(analysis && !sameParameters(parameters, analysis.parameters));
  const stale = Boolean(
    workspace.analysis?.stale || parametersDirty || parametersDiffer,
  );
  async function perform(label: string, work: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    setError("");
    setSuccess("");
    try {
      await work();
    } catch (error) {
      setError(error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }
  async function reload() {
    const fresh = await request<Workspace>("/api/student/transcripts");
    setWorkspace(fresh);
    return fresh;
  }
  function modifyDraft(change: (value: DraftView) => DraftView) {
    setDraft((previous) => (previous ? change(previous) : null));
    setDraftDirty(true);
    setReviewed(false);
  }
  function patchRow(ordinal: number, key: string, value: unknown) {
    modifyDraft((previous) => ({
      ...previous,
      attempts: previous.attempts.map((row) =>
        row.ordinal === ordinal ? { ...row, [key]: value } : row,
      ),
    }));
  }
  async function saveCurrent() {
    if (!draft) return null;
    if (!draftDirty) return draft;
    const updated = await request<DraftView>(
      `/api/student/transcripts/${draft.id}`,
      { expectedVersion: draft.editVersion, payload: draft },
      "PATCH",
    );
    setDraft(updated);
    setDraftDirty(false);
    return updated;
  }
  async function calculate() {
    const output = await request<{ id: string; result: AcademicResult }>(
      "/api/student/analysis",
      parameters,
    );
    await reload();
    setParametersDirty(false);
    setTrack(output.result.plans[0].track);
    setEventTerm(
      `${parameters.currentTerm.year}/${parameters.currentTerm.semester}`,
    );
    setEventCode("");
    setComparison(null);
    setTab(1);
  }
  function changeParameters(change: Partial<PlanningParameters>) {
    setParameters((previous) => ({ ...previous, ...change }));
    setParametersDirty(true);
    setComparison(null);
  }
  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draftDirty) {
      setError("บันทึกหรือยกเลิกการแก้ร่างก่อนนำเข้า PDF ใหม่");
      return;
    }
    const form = new FormData(event.currentTarget);
    void perform("กำลังอ่าน PDF และตรวจข้อมูล", async () => {
      const response = await fetch("/api/student/transcripts", {
        method: "POST",
        body: form,
      });
      const output = await response.json();
      if (!response.ok)
        throw new Error(output.error?.message || "อ่าน PDF ไม่สำเร็จ");
      setDraft(output);
      setDraftDirty(false);
      setReviewed(false);
      await reload();
      setSuccess("อ่านเป็นร่างแล้ว กรุณาตรวจส่วนหัวและรายการที่แจ้งก่อนยืนยัน");
    });
  }
  return (
    <div className={styles.workspace} aria-busy={Boolean(busy)}>
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>
            CS2565 · ติดตามและวางแผนการเรียน
          </span>
          <h1>
            {workspace.revision
              ? "ดูความก้าวหน้า แล้ววางแผนก้าวต่อไป"
              : "เริ่มจากผลการเรียนของคุณ"}
          </h1>
          <p>
            ตรวจข้อมูลจาก PDF ก่อนยืนยัน แผนและการจำลองใช้ข้อมูลที่ยืนยันแล้ว
          </p>
        </div>
        <span className={styles.badge}>
          {workspace.revision
            ? "มีผลการเรียนยืนยันแล้ว"
            : "ยังไม่มีผลการเรียนยืนยัน"}
        </span>
      </div>
      {workspace.enrollment && <p className={styles.muted}>รหัสนักศึกษา {workspace.enrollment.studentCode} · {workspace.enrollment.curriculumCode} · {workspace.enrollment.trackState === "selected" ? workspace.enrollment.trackName : workspace.enrollment.trackState === "not_selected" ? "ยังไม่เลือกสาย" : "ยังไม่ทราบสาย"} · {workspace.enrollment.confirmationSource === "student_confirmed" ? "ข้อมูลที่คุณยืนยันจากเอกสาร" : "ข้อมูลที่ผู้ดูแลตรวจแล้ว"}</p>}
      {!workspace.enrollment && <ol className={styles.journey} aria-label="เริ่มใช้งานครั้งแรก"><li aria-current="step">1 อัปโหลด PDF</li><li>2 ตรวจข้อมูล</li><li>3 ดูแผนของคุณ</li></ol>}
      <div role="status" aria-live="polite">
        {busy && <p className={styles.note}>{busy}…</p>}
        {success && <p className={styles.success}>{success}</p>}
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <nav className={styles.tabs} aria-label="ขั้นตอนวางแผนการเรียน">
        {[
          "ผลการเรียน",
          "ภาพรวม",
          "แผนการเรียน",
          "ลองปรับแผน",
        ].map((name, index) => (
          <button
            type="button"
            key={name}
            aria-pressed={tab === index}
            onClick={() => setTab(index)}
          >
            {name}
          </button>
        ))}
      </nav>
      {!workspace.dataset && workspace.enrollment && (
        <p className={styles.note}>
          ข้อมูลหลักสูตรยังไม่พร้อม คุณอัปโหลดและยืนยันผลการเรียนได้
          ส่วนการวิเคราะห์และแผนจะเริ่มได้เมื่อผู้ดูแลเผยแพร่ข้อมูลหลักสูตร
        </p>
      )}
      {workspace.analysis?.stale && (
        <p className={styles.note}>
          ข้อมูลเปลี่ยนแล้ว กรุณาคำนวณแผนใหม่
        </p>
      )}
      {tab === 0 && (
        <>
          <section className={styles.card}>
            <h2>นำเข้าใบรายงานผลการศึกษา</h2>
            <p className={styles.muted}>
              ใช้ PDF ที่มีชั้นข้อความจากทะเบียน ไม่เกิน 10 MB / 30 หน้า
              ระบบยังไม่รองรับไฟล์สแกน
            </p>
            <form onSubmit={upload}>
              <label className={styles.upload}>
                เลือกใบรายงานผลการศึกษา PDF
                <input
                  type="file"
                  name="file"
                  accept="application/pdf,.pdf"
                  required
                  disabled={Boolean(busy) || draftDirty}
                />
              </label>
              <div className={styles.actions}>
                <button
                  className={styles.primary}
                  disabled={Boolean(busy) || draftDirty}
                >
                  อ่าน PDF เป็นร่าง
                </button>
              </div>
            </form>
            {workspace.revision && (
              <>
                <p className={styles.note}>
                  มีผลการเรียนที่ยืนยันแล้วแล้ว
                  การนำเข้าร่างใหม่จะคงผลเดิมจนกว่าจะยืนยันใหม่สำเร็จ
                </p>
                <button
                  className={styles.secondary}
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void perform("กำลังสร้างร่างแก้ไข", async () => {
                      const output = await request<DraftView>(
                        "/api/student/transcripts",
                        { action: "revise" },
                      );
                      setDraft(output);
                      setDraftDirty(false);
                      setReviewed(false);
                      await reload();
                    })
                  }
                >
                  สร้างร่างแก้ไขจากผลการเรียนที่ยืนยันแล้ว
                </button>
              </>
            )}
            {workspace.drafts.length > 1 && (
              <label className={styles.field}>
                เลือกร่างที่ต้องตรวจ
                <select
                  value={draft?.id ?? ""}
                  disabled={Boolean(busy) || draftDirty}
                  onChange={(event) => {
                    setDraft(
                      workspace.drafts.find(
                        (d) => d.id === event.target.value,
                      ) ?? null,
                    );
                    setReviewed(false);
                  }}
                >
                  {workspace.drafts.map((d, index) => (
                    <option value={d.id} key={d.id}>
                      ร่าง {index + 1} · {d.attempts.length} รายการ
                    </option>
                  ))}
                </select>
              </label>
            )}
          </section>
          {draft && (
            <section className={styles.card}>
              <h2>ตรวจข้อมูลก่อนเริ่มวางแผน</h2>
              {!workspace.enrollment && <p className={styles.note}>หลักสูตรที่ใช้วิเคราะห์: วิทยาการคอมพิวเตอร์ พ.ศ. 2565 (CS2565) ตรวจชื่อและรหัสนักศึกษาให้ตรงกับเอกสารก่อนยืนยัน ข้อมูลนี้เป็นข้อมูลที่คุณยืนยันเอง</p>}
              <p>
                {draft.attempts.length} รายการ · {draft.pages} หน้า · มี{" "}
                {issues.filter((i) => i.severity === "blocking").length}{" "}
                จุดที่ต้องแก้ก่อนยืนยัน
              </p>
              <a
                href={`/api/student/documents/${draft.documentId}`}
                target="_blank"
                rel="noreferrer"
              >
                เปิด PDF ต้นฉบับในแท็บใหม่
              </a>
              {issues.length > 0 && (
                <div className={styles.note}>
                  <ul className={styles.list}>
                    {issues.map((issue, index) => (
                      <li key={`${issue.code}-${index}`}>
                        {issue.severity === "blocking"
                          ? "ต้องตรวจ"
                          : "ข้อจำกัด"}
                        : {issue.message} ·{" "}
                        <a
                          href={`/api/student/documents/${draft.documentId}#page=${issue.sourcePage}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          หน้า {issue.sourcePage}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <details
                className={styles.detail}
                open={issues.some((i) => i.field)}
              >
                <summary>ข้อมูลส่วนหัวที่ PDF รายงาน</summary>
                <div className={styles.form}>
                  {Object.entries(headerNames).map(([key, name]) => (
                    <label key={key} className={styles.field}>
                      {name}
                      <input
                        value={
                          draft.header[key as keyof typeof headerNames].value ??
                          ""
                        }
                        disabled={Boolean(busy)}
                        onChange={(event) =>
                          modifyDraft((previous) => ({
                            ...previous,
                            header: {
                              ...previous.header,
                              [key]: {
                                value: event.target.value || null,
                                state: event.target.value
                                  ? "present"
                                  : "unreadable",
                                sourcePage: 1,
                              },
                            },
                          }))
                        }
                      />
                    </label>
                  ))}
                  <label className={styles.field}>
                    สายที่ระบุในเอกสาร
                    <select
                      value={
                        draft.header.trackState === "selected"
                          ? (draft.header.track ?? "unknown")
                          : draft.header.trackState
                      }
                      disabled={Boolean(busy)}
                      onChange={(event) =>
                        modifyDraft((previous) => ({
                          ...previous,
                          header: {
                            ...previous.header,
                            track:
                              event.target.value === "project" ||
                              event.target.value === "cooperative"
                                ? event.target.value
                                : null,
                            trackState:
                              event.target.value === "project" ||
                              event.target.value === "cooperative"
                                ? "selected"
                                : (event.target.value as
                                    | "not_selected"
                                    | "unknown"),
                          },
                        }))
                      }
                    >
                      <option value="unknown">ยังอ่านหรือระบุไม่ได้</option>
                      <option value="not_selected">
                        อ่านครบแล้ว ไม่มีสายระบุ
                      </option>
                      <option value="project">โครงงานวิจัย</option>
                      <option value="cooperative">สหกิจศึกษา</option>
                    </select>
                  </label>
                </div>
                <p className={styles.muted}>
                  ตรวจให้ตรงกับใบผลการเรียนของคุณ ข้อมูลนี้ไม่เปลี่ยนบัญชี Google หรือสิทธิ์ผู้ใช้
                </p>
              </details>
              <details className={styles.detail}>
                <summary>ดูและแก้รายละเอียดทุกรายวิชา</summary>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={onlyProblems}
                    onChange={(event) => setOnlyProblems(event.target.checked)}
                  />
                  แสดงเฉพาะรายการที่แจ้งปัญหาหรือข้อจำกัด
                </label>
                <div
                  className={styles.tableWrap}
                  tabIndex={0}
                  aria-label="ตารางตรวจรายวิชา เลื่อนแนวนอนได้"
                >
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        {[
                          "รหัส",
                          "ชื่อวิชา",
                          "หน่วยกิต",
                          "เกรดตามเอกสาร",
                          "คะแนนเกรด",
                          "ปี พ.ศ.",
                          "ภาค",
                          "ประเภทการเรียน",
                          "ต้นฉบับ",
                        ].map((name) => (
                          <th key={name}>{name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {draft.attempts
                        .filter(
                          (row) =>
                            !onlyProblems ||
                            issues.some((i) => i.ordinal === row.ordinal),
                        )
                        .map((row) => (
                          <tr
                            key={row.ordinal}
                            data-problem={issues.some(
                              (i) => i.ordinal === row.ordinal,
                            )}
                          >
                            <td>
                              <input
                                aria-label={`รหัสแถว ${row.ordinal + 1}`}
                                value={row.courseCode}
                                onChange={(e) =>
                                  patchRow(
                                    row.ordinal,
                                    "courseCode",
                                    e.target.value,
                                  )
                                }
                                disabled={Boolean(busy)}
                              />
                            </td>
                            <td data-wide>
                              <input
                                aria-label={`ชื่อแถว ${row.ordinal + 1}`}
                                value={row.name}
                                onChange={(e) =>
                                  patchRow(row.ordinal, "name", e.target.value)
                                }
                                disabled={Boolean(busy)}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                max="30"
                                aria-label={`หน่วยกิตแถว ${row.ordinal + 1}`}
                                value={row.credits ?? ""}
                                onChange={(e) =>
                                  patchRow(
                                    row.ordinal,
                                    "credits",
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value),
                                  )
                                }
                                disabled={Boolean(busy)}
                              />
                            </td>
                            <td>
                              <select
                                aria-label={`เกรดแถว ${row.ordinal + 1}`}
                                value={row.grade ?? ""}
                                onChange={(e) =>
                                  patchRow(
                                    row.ordinal,
                                    "grade",
                                    e.target.value || null,
                                  )
                                }
                                disabled={Boolean(busy)}
                              >
                                <option value="">ว่างตามต้นฉบับ</option>
                                {GRADES.map((g) => (
                                  <option key={g}>{g}</option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                aria-label={`คะแนนแถว ${row.ordinal + 1}`}
                                value={row.gradePoints ?? ""}
                                onChange={(e) =>
                                  patchRow(
                                    row.ordinal,
                                    "gradePoints",
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value),
                                  )
                                }
                                disabled={Boolean(busy)}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min="2500"
                                max="2700"
                                aria-label={`ปีแถว ${row.ordinal + 1}`}
                                value={row.year ?? ""}
                                onChange={(e) =>
                                  patchRow(
                                    row.ordinal,
                                    "year",
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value),
                                  )
                                }
                                disabled={Boolean(busy)}
                              />
                            </td>
                            <td>
                              <select
                                aria-label={`ภาคแถว ${row.ordinal + 1}`}
                                value={row.semester ?? ""}
                                onChange={(e) =>
                                  patchRow(
                                    row.ordinal,
                                    "semester",
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value),
                                  )
                                }
                                disabled={Boolean(busy)}
                              >
                                <option value="">ไม่ระบุ</option>
                                {[1, 2, 3].map((n) => (
                                  <option key={n} value={n}>
                                    {n === 3 ? "ฤดูร้อน" : n}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <select
                                aria-label={`ประเภทการเรียนแถว ${row.ordinal + 1}`}
                                value={row.kind}
                                onChange={(e) =>
                                  patchRow(row.ordinal, "kind", e.target.value)
                                }
                                disabled={Boolean(busy)}
                              >
                                <option value="semester">รายภาค</option>
                                <option value="transfer">โอน</option>
                                <option value="unknown">ยังไม่ทราบ</option>
                              </select>
                            </td>
                            <td>
                              <a
                                href={`/api/student/documents/${draft.documentId}#page=${row.sourcePage}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                หน้า {row.sourcePage}
                              </a>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <details className={styles.detail}>
                <summary>ยอดสรุปที่เอกสารรายงาน</summary>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>หน้า / ภาค</th>
                        <th>ชนิด</th>
                        <th>ค่าจากต้นฉบับ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.summaries.map((s, index) => (
                        <tr key={index}>
                          <td>
                            {s.sourcePage} ·{" "}
                            {s.year && s.semester
                              ? `${s.year}/${s.semester}`
                              : "ส่วนหัว"}
                          </td>
                          <td>
                            {s.kind === "latest_cumulative"
                              ? "ยอดสะสมล่าสุด"
                              : s.kind === "cumulative"
                              ? "สะสม"
                              : s.kind === "latest_semester"
                                ? "ภาคล่าสุด"
                                : "รายภาค"}
                          </td>
                          <td>
                            {Object.entries(s.fields)
                              .filter(([key]) => key !== "raw")
                              .map(([key, value]) => `${key}: ${value}`)
                              .join(" · ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={reviewed}
                  disabled={Boolean(busy)}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                ฉันตรวจข้อมูลสรุปและจุดที่แจ้งกับต้นฉบับแล้ว
                และยืนยันว่าเป็นใบผลการเรียนของฉัน
              </label>
              <div className={styles.actions}>
                <button
                  className={styles.secondary}
                  disabled={Boolean(busy) || !draftDirty}
                  onClick={() =>
                    void perform("กำลังบันทึกร่าง", async () => {
                      await saveCurrent();
                      await reload();
                      setSuccess("บันทึกร่างแล้ว ยังไม่เปลี่ยนข้อมูลยืนยัน");
                    })
                  }
                >
                  บันทึกการแก้ร่าง
                </button>
                <button
                  className={styles.primary}
                  disabled={
                    Boolean(busy) ||
                    !reviewed ||
                    issues.some((i) => i.severity === "blocking")
                  }
                  onClick={() =>
                    void perform("กำลังยืนยันผลการเรียน", async () => {
                      const current = await saveCurrent();
                      if (!current) return;
                      await request(
                        `/api/student/transcripts/${current.id}/confirm`,
                        { expectedVersion: current.editVersion },
                      );
                      setDraft(null);
                      setDraftDirty(false);
                      setReviewed(false);
                      const fresh = await reload();
                      setSuccess("ยืนยันผลการเรียนแล้ว");
                      if (fresh.dataset) {
                        try {
                          await calculate();
                        } catch (e) {
                          setError(
                            `ยืนยันแล้ว แต่ยังวิเคราะห์ต่อไม่ได้: ${e instanceof Error ? e.message : "กรุณาลองใหม่"}`,
                          );
                        }
                      } else setTab(1);
                    })
                  }
                >
                  ยืนยันข้อมูลชุดนี้
                </button>
                <button
                  className={styles.secondary}
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void perform("กำลังยกเลิกร่าง", async () => {
                      await request(
                        `/api/student/transcripts/${draft.id}`,
                        { expectedVersion: draft.editVersion },
                        "DELETE",
                      );
                      setDraft(null);
                      setDraftDirty(false);
                      await reload();
                      setSuccess("ยกเลิกการแก้ไขแล้ว ผลการเรียนเดิมยังอยู่");
                    })
                  }
                >
                  ยกเลิกร่างนี้
                </button>
              </div>
            </section>
          )}
        </>
      )}
      {tab !== 0 && (
        <details className={styles.card} open={!analysis || stale}>
          <summary className={styles.parameterSummary}>
            <span>ปรับเงื่อนไขแผน</span>
            <small>เริ่ม {parameters.currentTerm.year}/{parameters.currentTerm.semester} · ภาคปกติ {parameters.normalLoad} หน่วยกิต · เกรดสมมติ {parameters.targetGrade}</small>
          </summary>
          <h2>เงื่อนไขที่ใช้คำนวณแผน</h2>
          <p className={styles.muted}>
            ภาคที่เริ่มวางแผนและเกรดเป้าหมายเป็นค่าที่คุณกำหนด
            ภาระเรียนเป็นเป้าหมายส่วนตัวภายในเพดานที่ชุดข้อมูลรองรับ
          </p>
          <div className={styles.form}>
            <label className={styles.field}>
              ปีอ้างอิง พ.ศ.
              <input
                type="number"
                min="2500"
                max="2700"
                value={parameters.currentTerm.year}
                onChange={(e) =>
                  changeParameters({
                    currentTerm: {
                      ...parameters.currentTerm,
                      year: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label className={styles.field}>
              ภาคที่เริ่มวางแผน
              <select
                value={parameters.currentTerm.semester}
                onChange={(e) =>
                  changeParameters({
                    currentTerm: {
                      ...parameters.currentTerm,
                      semester: Number(e.target.value) as 1 | 2 | 3,
                    },
                  })
                }
              >
                <option value="1">ภาคต้น</option>
                <option value="2">ภาคปลาย</option>
                <option value="3">ฤดูร้อน</option>
              </select>
            </label>
            <label className={styles.field}>
              เป้าหมายหน่วยกิตภาคปกติ
              <input
                type="number"
                min="1"
                max="22"
                value={parameters.normalLoad}
                onChange={(e) =>
                  changeParameters({ normalLoad: Number(e.target.value) })
                }
              />
            </label>
            <label className={styles.field}>
              เป้าหมายหน่วยกิตฤดูร้อน
              <input
                type="number"
                min="1"
                max="9"
                value={parameters.summerLoad}
                onChange={(e) =>
                  changeParameters({ summerLoad: Number(e.target.value) })
                }
              />
            </label>
            <label className={styles.field}>
              เกรดสมมติของวิชาตัวเลข
              <select
                value={parameters.targetGrade}
                onChange={(e) =>
                  changeParameters({ targetGrade: e.target.value })
                }
              >
                {["A", "B+", "B", "C+", "C", "D+", "D"].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              ช่วงค้นหาแผน (ภาค)
              <input
                type="number"
                min="1"
                max="24"
                value={parameters.horizon}
                onChange={(e) =>
                  changeParameters({ horizon: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={parameters.assumeUnknownOfferings}
              onChange={(e) =>
                changeParameters({ assumeUnknownOfferings: e.target.checked })
              }
            />
            สร้างแผนทางเลือกโดยสมมติว่าวิชาที่ไม่ทราบการเปิดสอนเปิดได้
            ผลยังต้องตรวจตารางจริง
          </label>
          {(parametersDirty || parametersDiffer) && (
            <p className={styles.note}>
              เปลี่ยนเงื่อนไขแล้ว กรุณาคำนวณแผนใหม่
            </p>
          )}
          <button
            className={styles.primary}
            disabled={Boolean(busy) || !workspace.revision}
            onClick={() =>
              void perform("กำลังวิเคราะห์และสร้างแผน", async () => {
                await calculate();
                setSuccess(
                  "คำนวณแผนแล้ว ตรวจรายละเอียดและข้อมูลที่ยังขาดก่อนใช้วางแผน",
                );
              })
            }
          >
            คำนวณความก้าวหน้าและแผนใหม่
          </button>
          {!workspace.revision && (
            <p className={styles.note}>
              ยังไม่มีข้อมูลยืนยัน เริ่มที่นำเข้าและตรวจทานก่อน
            </p>
          )}
        </details>
      )}
      {analysis && audit && tab !== 0 && (
        <div className={styles.actions}>
          <label className={styles.field}>
            สายที่ดูผล
            <select
              value={audit.track}
              onChange={(e) => {
                setTrack(e.target.value as StudyTrack);
                setComparison(null);
              }}
            >
              {analysis.audits.map((a) => (
                <option key={a.track} value={a.track}>
                  {TRACK_NAMES[a.track]}
                  {analysis.trackState === "not_selected" ? " · ทางเลือก" : ""}
                </option>
              ))}
            </select>
          </label>
          <p className={styles.muted}>
            หลักสูตรฉบับ {analysis.datasetVersion} ·
            ใช้ผลการเรียนที่ยืนยันแล้ว{stale ? " · ผลเก่า" : ""}
          </p>
        </div>
      )}
      {tab !== 0 && workspace.enrollment && <StudentTrackCriteria key={`${parameters.currentTerm.year}/${parameters.currentTerm.semester}/${workspace.revision?.id}`} year={parameters.currentTerm.year} semester={parameters.currentTerm.semester} revisionId={workspace.revision?.id} />}
      {tab === 1 && audit && (
        <>
          <div className={styles.metrics}>
            <div className={styles.metric}>
              <span>เกรดเฉลี่ยสะสม (GPAX)</span>
              <strong>{audit.gpax.value?.toFixed(2) ?? "—"}</strong>
              <small>{audit.gpax.confirmed ? "คำนวณจากผลการเรียนที่ยืนยันแล้ว" : "คำนวณเบื้องต้น เกณฑ์บางข้อยังไม่ยืนยัน"}</small>
              <br />
              <small>แสดงสองตำแหน่ง; การเทียบเกณฑ์ใช้ค่าก่อนปัด</small>
            </div>
            <div className={styles.metric}>
              <span>หน่วยกิตที่เรียนผ่าน</span>
              <strong>{audit.earnedCredits}</strong>
              <small>ไม่รวมเสริมพื้นฐานและรายการที่ยังสรุปไม่ได้</small>
            </div>
            <div className={styles.metric}>
              <span>
                เกรดเฉลี่ยวิชาเฉพาะ {audit.specificGpa.confirmed ? "" : "(เบื้องต้น)"}
              </span>
              <strong>{audit.specificGpa.value?.toFixed(2) ?? "—"}</strong>
              <small>รวมวิชาเฉพาะที่ชุดข้อมูลระบุ</small>
            </div>
            <div className={styles.metric}>
              <span>ความเสี่ยงเพื่อวางแผน</span>
              <strong>
                {
                  {
                    critical: "ความเสี่ยงวิกฤต",
                    high: "โปรต่ำตาม APS",
                    watch: "โปรสูงตาม APS",
                    low: "ความเสี่ยงต่ำ",
                    unknown: "ข้อมูลไม่พอ",
                  }[audit.risk.level]
                }
              </strong>
              <small>{audit.risk.message}</small>
            </div>
          </div>
          <p className={styles.note}>{audit.graduation === "requirements_not_met" ? "ยังขาดรายวิชา หน่วยกิต หมวด หรือ GPA/GPAX ตามเกณฑ์ที่ระบบตรวจได้" : audit.graduation === "not_evaluated" ? "ยังสรุปเงื่อนไขการเรียนไม่ได้ ต้องตรวจข้อมูลและกฎที่ค้าง" : "ครบเงื่อนไขการเรียนที่ระบบตรวจได้ ยังต้องตรวจเงื่อนไขอื่นและการอนุมัติจากมหาวิทยาลัย"}</p>
          {audit.recovery?.length > 0 && (
            <section className={styles.card}>
              <h2>ตัวเลือกฟื้น GPAX ที่ควรตรวจสิทธิ์เรียนซ้ำ</h2>
              <p className={styles.muted}>
                ตัวอย่างสมมติเกรด B คำนวณเป็นตัวอย่าง ผลนี้ไม่เปลี่ยน GPAX
                จริงและไม่ใช่การอนุมัติลงทะเบียน
              </p>
              <div
                className={styles.tableWrap}
                tabIndex={0}
                aria-label="ตัวเลือกฟื้น GPAX"
              >
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>วิชา</th>
                      <th>เกรดเดิม</th>
                      <th>GPAX เบื้องต้นถ้าได้ B</th>
                      <th>ลองในแผน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.recovery.map((item) => (
                      <tr key={item.courseCode}>
                        <td>{item.courseCode}</td>
                        <td>{item.grade}</td>
                        <td>
                          {item.diagnosticGpax?.toFixed(2) ?? "ยังคาดไม่ได้"}
                        </td>
                        <td>
                          <button
                            type="button"
                            className={styles.secondary}
                            disabled={Boolean(busy) || stale}
                            onClick={() => {
                              setEventAction("add");
                              setEventCode(item.courseCode);
                              setEventGrade(item.targetGrade);
                              setEventTerm(
                                `${analysis!.parameters.currentTerm.year}/${analysis!.parameters.currentTerm.semester}`,
                              );
                              setComparison(null);
                              setTab(3);
                            }}
                          >
                            ลอง {item.courseCode}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={styles.note}>
                ต้องตรวจสิทธิ์เรียนซ้ำ การเปิดสอน
                และนโยบายที่ค้างก่อนใช้ผลวางแผนจริง
              </p>
            </section>
          )}
          <section className={styles.card}>
            <h2>ความก้าวหน้าตามหมวด</h2>
            {audit.groups.map((g) => (
              <div className={styles.progress} key={g.category}>
                <p>
                  {CATEGORY_NAMES[g.category]} · {g.earned}/{g.minimum} ·{" "}
                  {g.status === "unknown"
                    ? "ข้อมูลไม่พอ"
                    : g.remaining
                      ? `ขาด ${g.remaining} หน่วยกิต`
                      : "ครบขั้นต่ำ"}
                </p>
                <progress
                  aria-label={CATEGORY_NAMES[g.category]}
                  value={Math.min(g.earned, g.minimum)}
                  max={g.minimum || 1}
                />
              </div>
            ))}
            <p className={styles.note}>
              ความเสี่ยงภายใน APS เป็นข้อมูลช่วยวางแผน
              ไม่ใช่การจำแนกสถานภาพหรืออนุมัติสำเร็จการศึกษาของมหาวิทยาลัย
            </p>
          </section>
          <section className={styles.card}>
            <h2>รายวิชาและจุดที่ต้องติดตาม</h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>รายวิชา</th>
                    <th>หมวด</th>
                    <th>ผล</th>
                    <th>เกรดล่าสุด</th>
                    <th>เหตุผล</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.courses
                    .filter((c) => c.status !== "passed" || c.reasons.length)
                    .map((c) => (
                      <tr key={c.code}>
                        <td>
                          {c.code} · {c.name}
                        </td>
                        <td>{CATEGORY_NAMES[c.category]}</td>
                        <td>{statusNames[c.status]}</td>
                        <td>{c.latestGrade ?? "—"}</td>
                        <td>
                          {c.reasons.join("; ") ||
                            "ตรวจร่วมกับแผนและเงื่อนไขรายวิชา"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
          {audit.warnings.length > 0 && (
            <section className={styles.card}>
              <h2>ข้อจำกัดของผลชุดนี้</h2>
              <ul className={styles.list}>
                {audit.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {tab === 2 && plan && audit && analysis && (
        <section className={styles.card}>
          <h2>แผนการเรียน · {TRACK_NAMES[plan.track]}</h2>
          <p className={styles.note}>
            ภาคคาดจบ: {termName(plan.graduationTerm)} ·{" "}
            {plan.basis === "alternative"
              ? "เป็นทางเลือก ยังไม่เปลี่ยนสายจริง"
              : "ภายใต้ข้อมูลและสมมติฐานชุดนี้"}
          </p>
          <details className={styles.detail}>
            <summary>สมมติฐานและเหตุผลที่ยังคาดจบไม่ได้</summary>
            <ul className={styles.list}>
              {[...plan.assumptions, ...plan.limitations].map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </details>
          {!plan.terms.some((t) => t.courses.length) && (
            <p className={styles.note}>
              ยังไม่มีภาคที่จัดรายวิชาได้
              ตรวจข้อมูลเปิดสอนและเหตุผลของวิชาที่ติดก่อน
              หรือสร้างแผนภายใต้สมมติฐานที่ระบุ
            </p>
          )}
          <div className={styles.plans}>
            {plan.terms
              .filter((t) => t.courses.length)
              .map((t) => (
                <article className={styles.term} key={termName(t.term)}>
                  <h3>{termName(t.term)}</h3>
                  <p className={styles.muted}>
                    {t.credits} หน่วยกิต · GPAX สมมติ{" "}
                    {t.projectedGpax?.toFixed(2) ?? "—"}
                  </p>
                  {t.courses.length === 0 ? (
                    <p>ยังจัดวิชาในภาคนี้ไม่ได้</p>
                  ) : (
                    t.courses.map((c) => (
                      <details className={styles.course} key={c.code}>
                        <summary>
                          {c.code} · {c.name} ({c.credits})
                        </summary>
                        <p>เกรดสมมติ {c.grade}</p>
                        {c.assumptions.map((a) => (
                          <p className={styles.note} key={a}>
                            {a}
                          </p>
                        ))}
                        <ul className={styles.list}>
                          {c.reasons.map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                        {analysis.catalogue.find(
                          (item) => item.code === c.code,
                        ) && (
                          <RelatedDependencies
                            course={
                              analysis.catalogue.find(
                                (item) => item.code === c.code,
                              )!
                            }
                            catalogue={analysis.catalogue}
                            results={audit.courses}
                          />
                        )}
                      </details>
                    ))
                  )}
                </article>
              ))}
          </div>
          {plan.blocked.length > 0 && (
            <>
              <h3>วิชาที่ยังจัดไม่ได้</h3>
              <ul className={styles.list}>
                {plan.blocked.map((c) => (
                  <li key={c.code}>
                    {c.code}: {c.reasons.join("; ")}
                  </li>
                ))}
              </ul>
            </>
          )}
          <details className={styles.detail}>
            <summary>ดูสรุปรายปี</summary>
            {[...new Set(plan.terms.map((t) => t.term.year))].map((year) => (
              <p key={year}>
                ปี {year}:{" "}
                {plan.terms
                  .filter((t) => t.term.year === year)
                  .reduce((sum, t) => sum + t.credits, 0)}{" "}
                หน่วยกิต จากภาคในแผนชุดเดียวกัน
              </p>
            ))}
          </details>
        </section>
      )}
      {tab === 3 && analysis && plan && (
        <section className={styles.card}>
          <h2>ถ้าวิชานี้เปลี่ยน แผนจะเปลี่ยนอย่างไร</h2>
          <p>
            ลองเปลี่ยนแผนโดยใช้ผลการเรียนเดิม ข้อมูลจริงของคุณจะไม่เปลี่ยน
          </p>
          <div className={styles.form}>
            <label className={styles.field}>
              เหตุการณ์
              <select
                value={eventAction}
                onChange={(e) => {
                  setEventAction(e.target.value as ScenarioEvent["action"]);
                  setEventCode("");
                  setComparison(null);
                }}
              >
                <option value="drop">ถอนวิชาออกจากแผนภาคนั้น</option>
                <option value="fail">ไม่ผ่านวิชาในแผน</option>
                <option value="add">เพิ่มวิชา / เรียนซ้ำที่มีสิทธิ์</option>
                <option value="offering_open">
                  สมมติเปิดสอนจากข้อมูลที่ยังไม่ทราบ
                </option>
                <option value="offering_closed">
                  สมมติไม่เปิดสอนจากข้อมูลที่ยังไม่ทราบ
                </option>
              </select>
            </label>
            <label className={styles.field}>
              ภาคที่จำลอง
              <select
                value={eventTerm}
                onChange={(e) => {
                  setEventTerm(e.target.value);
                  setEventCode("");
                  setComparison(null);
                }}
              >
                {(plan.terms.length
                  ? plan.terms
                  : [{ term: analysis.parameters.currentTerm }]
                ).map((t) => (
                  <option
                    key={termName(t.term)}
                    value={`${t.term.year}/${t.term.semester}`}
                  >
                    {termName(t.term)}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              รายวิชา
              <select
                value={eventCode}
                onChange={(e) => {
                  setEventCode(e.target.value);
                  setEventGrade(
                    analysis.catalogue.find((c) => c.code === e.target.value)
                      ?.grading === "su"
                      ? "S"
                      : "B",
                  );
                  setComparison(null);
                }}
              >
                <option value="">เลือกรายวิชา</option>
                {(eventAction === "add" || eventAction.startsWith("offering_")
                  ? analysis.catalogue.filter(
                      (c) => !c.tracks.length || c.tracks.includes(plan.track),
                    )
                  : (plan.terms.find(
                      (t) => `${t.term.year}/${t.term.semester}` === eventTerm,
                    )?.courses ?? [])
                ).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </select>
            </label>
            {eventAction === "add" && (
              <label className={styles.field}>
                เกรดสมมติ
                <select
                  value={eventGrade}
                  onChange={(e) => {
                    setEventGrade(e.target.value);
                    setComparison(null);
                  }}
                >
                  {(analysis.catalogue.find((c) => c.code === eventCode)
                    ?.grading === "su"
                    ? ["S", "U"]
                    : ["A", "B+", "B", "C+", "C", "D+", "D", "F"]
                  ).map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className={styles.actions}>
            <button
              className={styles.primary}
              disabled={Boolean(busy) || !eventCode || stale}
              onClick={() =>
                void perform("กำลังเปรียบเทียบสถานการณ์", async () => {
                  const [year, semester] = eventTerm.split("/").map(Number);
                  const output = await request<{
                    comparison: ReturnType<typeof simulate>;
                  }>("/api/student/scenarios", {
                    analysisId: workspace.analysis!.id,
                    track: plan.track,
                    events: eventAction.startsWith("offering_")
                      ? []
                      : [
                          {
                            action: eventAction,
                            courseCode: eventCode,
                            term: { year, semester },
                            grade: eventAction === "add" ? eventGrade : null,
                          },
                        ],
                    offeringAssumptions: eventAction.startsWith("offering_")
                      ? [
                          {
                            courseCode: eventCode,
                            term: { year, semester },
                            availability:
                              eventAction === "offering_open"
                                ? "open"
                                : "closed",
                          },
                        ]
                      : [],
                  });
                  setComparison(output.comparison);
                  setSuccess("เปรียบเทียบแล้ว ข้อมูลจริงยังคงเดิม");
                })
              }
            >
              เปรียบเทียบกับแผนเดิม
            </button>
            {comparison && (
              <button
                className={styles.secondary}
                disabled={Boolean(busy)}
                onClick={() => {
                  setComparison(null);
                  setSuccess(
                    "ยกเลิกสถานการณ์แล้ว แผนเดิมและข้อมูลจริงยังคงเดิม",
                  );
                }}
              >
                ยกเลิกสถานการณ์
              </button>
            )}
          </div>
          {stale && (
            <p className={styles.note}>
              ข้อมูลหรือเงื่อนไขเปลี่ยนแล้ว กรุณาคำนวณแผนใหม่ก่อนลองปรับแผน
            </p>
          )}
          {comparison && (
            <>
              <div className={styles.metrics}>
                <div className={styles.metric}>
                  <span>ภาคคาดจบฐาน</span>
                  <strong>
                    {termName(comparison.baseline.graduationTerm)}
                  </strong>
                </div>
                <div className={styles.metric}>
                  <span>ภาคคาดจบจำลอง</span>
                  <strong>{termName(comparison.changed.graduationTerm)}</strong>
                </div>
                <div className={styles.metric}>
                  <span>ผลต่างภาค</span>
                  <strong>{comparison.termDifference ?? "—"}</strong>
                  <small>{comparison.explanation}</small>
                </div>
                <div className={styles.metric}>
                  <span>GPAX คาดการณ์หลังแผนจำลอง</span>
                  <strong>
                    {comparison.simulatedAudit.gpax.value?.toFixed(2) ?? "—"}
                  </strong>
                  <small>เป็นผลสมมติ แยกจาก GPAX จริงปัจจุบัน</small>
                </div>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>วิชา</th>
                      <th>ภาคในฐาน</th>
                      <th>ภาคผ่านในจำลอง</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.changes.map((c) => (
                      <tr key={c.courseCode}>
                        <td>{c.courseCode}</td>
                        <td>{termName(c.before)}</td>
                        <td>{termName(c.after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {comparison.changes.length === 0 && (
                <p>ไม่มีวิชาเปลี่ยนภาคภายใต้สถานการณ์นี้</p>
              )}
              <details className={styles.detail}>
                <summary>ข้อจำกัดและสมมติฐานของผลจำลอง</summary>
                <ul className={styles.list}>
                  {[
                    ...comparison.changed.assumptions,
                    ...comparison.changed.limitations,
                  ].map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </section>
      )}
    </div>
  );
}
