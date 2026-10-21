"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { studentWorkspace, AcademicResult } from "@/server/academic";
import type { DraftView } from "@/modules/transcript/types";
import { GRADES } from "@/modules/transcript/types";
import { transcriptIssues } from "@/modules/transcript/validation";
import {
  TRACK_NAMES,
  type StudyTrack,
} from "@/modules/curriculum/types";
import { sameParameters, type PlanningParameters } from "@/modules/planning/engine";
import type { simulate, ScenarioEvent } from "@/modules/simulation/engine";
import { StudentTrackCriteria } from "./student-track-criteria";
import { useSearchParams } from "next/navigation";
import { navigateStudent, STUDENT_VIEWS, studentView } from "./student-navigation";
import { useUnsavedChanges } from "./use-unsaved-changes";
import { StudentProgress } from "./student-progress";
import { StudentTrackComparison } from "./student-track-comparison";
import { StudentPlanner } from "./student-planner";
import { termName } from "./student-presenters";
import { ConfirmedTranscript } from "./confirmed-transcript";
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
class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
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
    throw new RequestError(result.error?.message || "ทำรายการไม่สำเร็จ กรุณาลองใหม่", response.status);
  return result;
}
export function StudentWorkspace({ initial }: { initial: Workspace }) {
  const [workspace, setWorkspace] = useState(initial);
  const searchParams = useSearchParams();
  const currentView = studentView(searchParams.get("view"), initial.drafts.length || !initial.revision ? "transcript" : "overview");
  const tab = currentView.tab;
  const workspaceHeading = useRef<HTMLHeadingElement>(null);
  function setTab(index: number) {
    navigateStudent(STUDENT_VIEWS.find(view => view.tab === index)?.id ?? "overview");
  }
  const [draft, setDraft] = useState<DraftView | null>(
      initial.drafts[0] ?? null,
    ),
    [draftDirty, setDraftDirty] = useState(false);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [conflict, setConflict] = useState(false);
  useUnsavedChanges(draftDirty);
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
  const nextStep = draft ? 1 : !workspace.revision ? 0 : !analysis || stale ? 2 : 3;
  const pendingTarget = useRef<string | null>(null);
  function focusSection(id: string) {
    const element = document.getElementById(id);
    if (!element) return;
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: "start", behavior: "instant" });
  }
  useEffect(() => {
    if (pendingTarget.current) {
      focusSection(pendingTarget.current);
      pendingTarget.current = null;
    }
    else workspaceHeading.current?.focus({ preventScroll: true });
  }, [tab]);
  function openSection(index: number, id: string) {
    if (tab === index) focusSection(id);
    else { pendingTarget.current = id; setTab(index); }
  }
  function openTab(index: number) {
    openSection(index, index === 2 ? "student-plan" : "student-work-tabs");
  }
  async function perform(label: string, work: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    setError("");
    setSuccess("");
    setConflict(false);
    try {
      await work();
    } catch (error) {
      setConflict(error instanceof RequestError && error.status === 409);
      if (error instanceof RequestError && error.status === 409) setComparison(null);
      setError(error instanceof TypeError || error instanceof SyntaxError
        ? "เชื่อมต่อหรืออ่านคำตอบจากระบบไม่ได้ ข้อมูลที่กรอกยังอยู่ กรุณาลองอีกครั้ง"
        : error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }
  async function reload() {
    setComparison(null);
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
  async function calculate(navigate = true) {
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
    if (navigate) setTab(1);
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
      setSuccess("อ่านข้อมูลแล้ว กรุณาตรวจชื่อ รหัสนักศึกษา และรายวิชาก่อนยืนยัน");
      openSection(0, "transcript-review");
    });
  }
  return (
    <div className={styles.workspace} aria-busy={Boolean(busy)}>
      <div className={styles.workspaceHeading}>
        <div>
          <span className={styles.eyebrow}>APS · วางแผนจากข้อมูลของคุณ</span>
          <h1 ref={workspaceHeading} tabIndex={-1}>{currentView.label}</h1>
        </div>
        <span className={styles.badge}>
          {workspace.revision
            ? "มีผลการเรียนยืนยันแล้ว"
            : "ยังไม่มีผลการเรียนยืนยัน"}
        </span>
      </div>
      {(tab === 0 || tab === 1) && <section className={styles.nextStep} aria-labelledby="student-next-step">
        <div>
          <span className={styles.eyebrow}>ขั้นตอนถัดไป</span>
          <h2 id="student-next-step">{draft ? "ตรวจข้อมูลที่อ่านจาก PDF" : !workspace.revision ? "นำเข้าผลการเรียนเพื่อเริ่มวางแผน" : !workspace.dataset ? "รอข้อมูลหลักสูตรจากผู้ดูแล" : !analysis || stale ? "คำนวณแผนจากข้อมูลที่ยืนยันแล้ว" : "เปิดแผนการเรียนของคุณ"}</h2>
          <p>{draft ? "เทียบชื่อ รหัสนักศึกษา และรายวิชากับต้นฉบับ แก้จุดที่ผิด แล้วทำเครื่องหมายตรวจทานก่อนยืนยัน" : !workspace.revision ? "เลือกไฟล์ PDF แล้วกดอ่านเป็นร่าง คุณจะได้ตรวจและแก้ข้อมูลก่อนนำไปคำนวณ" : !workspace.dataset ? "ผลการเรียนของคุณยังอยู่ แต่ระบบยังสร้างแผนไม่ได้จนกว่าผู้ดูแลจะเผยแพร่ข้อมูลหลักสูตรที่ตรงกัน" : !analysis || stale ? "ตรวจภาคเริ่มต้นและภาระเรียน แล้วคำนวณก่อนเปิดแผน ผลเดิมยังเก็บไว้" : "ดูรายวิชาที่แนะนำในแต่ละภาค เปรียบเทียบสายที่มีให้เลือก แล้วลองปรับแผนโดยไม่เปลี่ยนประวัติจริง"}</p>
        </div>
        {draft ? <a className={styles.primary} href="#transcript-review" onClick={event => { event.preventDefault(); openSection(0, "transcript-review"); }}>ไปตรวจข้อมูล</a>
          : !workspace.revision ? <a className={styles.primary} href="#transcript-upload" onClick={event => { event.preventDefault(); openSection(0, "transcript-upload"); }}>เริ่มอัปโหลด PDF</a>
          : !workspace.dataset ? <span className={styles.badge}>ยังสร้างแผนไม่ได้ · ข้อมูลหลักสูตรไม่พร้อม</span>
          : !analysis || stale ? <button className={styles.primary} onClick={() => openTab(1)}>ตรวจเงื่อนไขและคำนวณแผน</button>
          : <button className={styles.primary} onClick={() => openTab(2)}>เปิดแผนรายภาค</button>}
      </section>}
      {tab === 0 && workspace.revision && !draft && <div className={styles.actions}>
        <button className={styles.secondary} onClick={() => openSection(0, "confirmed-transcript")}>ดูข้อมูลผลการเรียน</button>
        <button className={styles.secondary} onClick={() => openSection(0, "transcript-upload")}>อัปโหลดผลการเรียนฉบับใหม่</button>
      </div>}
      {tab === 0 && <ol className={styles.journey} aria-label="ลำดับการวางแผน">
        {["อัปโหลด PDF", "ตรวจและยืนยัน", "คำนวณแผน", "ดูแผนและลองปรับ"].map((name, index) => <li key={name} aria-current={nextStep === index ? "step" : undefined}>{index + 1} {name}</li>)}
      </ol>}
      {workspace.enrollment && <p className={styles.muted}>รหัสนักศึกษา {workspace.enrollment.studentCode} · {workspace.enrollment.curriculumCode.startsWith("CS2565-DEMO-") ? "วิทยาการคอมพิวเตอร์ 2565 (ตัวอย่าง)" : workspace.enrollment.curriculumCode} · {workspace.enrollment.trackState === "selected" ? workspace.enrollment.trackName : workspace.enrollment.trackState === "not_selected" ? "ยังไม่เลือกสาย" : "ยังไม่ทราบสาย"} · {workspace.enrollment.confirmationSource === "student_confirmed" ? "ข้อมูลที่คุณยืนยันจากเอกสาร" : "ข้อมูลที่ผู้ดูแลตรวจแล้ว"}</p>}
      <div role="status" aria-live="polite">
        {busy && <p className={styles.note}>{busy}…</p>}
        {success && <p className={styles.success}>{success}</p>}
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {conflict && <p className={styles.note}>ข้อมูลที่แก้ยังอยู่ในแท็บนี้ อย่ารีเฟรชก่อนตรวจทาน <a href="/student" target="_blank" rel="noreferrer">เปิดฉบับล่าสุดในแท็บใหม่</a> เพื่อเทียบและย้ายเฉพาะส่วนที่ต้องการแก้ แล้วบันทึกจากฉบับล่าสุด ระบบจะไม่เขียนทับข้อมูลจากอีกแท็บให้อัตโนมัติ</p>}
      <nav className={styles.tabs} aria-label="ขั้นตอนวางแผนการเรียน" id="student-work-tabs" tabIndex={-1}>
        {STUDENT_VIEWS.map(({ label: name, tab: index }) => (
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
          {workspace.revision && !draft && <ConfirmedTranscript payload={workspace.revision.payload} confirmedAt={workspace.revision.confirmedAt} />}
          <section className={styles.card} id="transcript-upload" tabIndex={-1}>
            <h2>นำเข้าใบรายงานผลการศึกษา</h2>
            <p className={styles.muted}>
              ใช้ไฟล์ PDF จากทะเบียนที่เลือกหรือคัดลอกข้อความได้ ขนาดไม่เกิน 10 MB และไม่เกิน 30 หน้า
              ยังใช้ไฟล์รูปถ่ายหรือไฟล์สแกนไม่ได้
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
                  อ่านข้อมูลจาก PDF
                </button>
              </div>
            </form>
            {workspace.revision && (
              <>
                <p className={styles.note}>
                  มีผลการเรียนที่บันทึกไว้แล้ว
                  หากอัปโหลดไฟล์ใหม่ ผลเดิมจะยังอยู่จนกว่าคุณจะตรวจและยืนยันข้อมูลใหม่
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
                      openSection(0, "transcript-review");
                    })
                  }
                >
                  แก้ไขผลการเรียน
                </button>
              </>
            )}
            {!!workspace.revisionHistory.length && <section className={styles.note} aria-label="ประวัติฉบับผลการเรียน">
              <h2>ประวัติฉบับผลการเรียน</h2>
              <p>แสดงประวัติ 30 ฉบับล่าสุด การยกเลิกใช้หยุดนำฉบับปัจจุบันไปคำนวณ ไม่ลบ PDF หรือประวัติเดิม</p>
              {draft && <p>กรุณายืนยันหรือยกเลิกร่างที่เปิดอยู่ก่อนเปลี่ยนฉบับผลการเรียน</p>}
              {workspace.revisionHistory.map(item => <p key={item.id}>{new Date(item.confirmedAt).toLocaleString("th-TH")} · {item.id === workspace.revision?.id ? "ฉบับปัจจุบัน" : <button type="button" className={styles.secondary} disabled={Boolean(busy) || Boolean(draft)} onClick={() => {
                if (!window.confirm("ใช้ผลการเรียนฉบับนี้เป็นฉบับปัจจุบันอีกครั้ง? ต้องตรวจและคำนวณแผนใหม่ ผลเดิมยังเก็บอยู่")) return;
                void perform("กำลังเลือกฉบับผลการเรียน", async () => { await request("/api/student/transcripts", { action: "select_revision", revisionId: item.id, expectedRevisionId: workspace.revision?.id ?? null }); await reload(); setComparison(null); setSuccess("เลือกฉบับผลการเรียนแล้ว กรุณาตรวจข้อมูลและคำนวณแผนใหม่"); });
              }}>ใช้ฉบับนี้อีกครั้ง</button>}</p>)}
              {workspace.revision && <button type="button" className={styles.secondary} disabled={Boolean(busy) || Boolean(draft)} onClick={() => {
                if (!window.confirm("ยกเลิกใช้ผลการเรียนฉบับปัจจุบัน? จะหยุดแสดงผลวิเคราะห์จนกว่าจะเลือกหรือยืนยันฉบับใหม่ ประวัติและ PDF ยังอยู่")) return;
                void perform("กำลังยกเลิกใช้ผลการเรียน", async () => { await request("/api/student/transcripts", { action: "select_revision", revisionId: null, expectedRevisionId: workspace.revision!.id }); await reload(); setComparison(null); setSuccess("ยกเลิกใช้ผลการเรียนแล้ว ประวัติเดิมยังอยู่"); });
              }}>ยกเลิกใช้ผลการเรียนฉบับปัจจุบัน</button>}
            </section>}
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
            <section className={styles.card} id="transcript-review" tabIndex={-1}>
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
                open
              >
                <summary>ข้อมูลนักศึกษาจาก PDF</summary>
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
              <details className={styles.detail} open>
                <summary>รายวิชาและผลการเรียน</summary>
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
              {!reviewed && <p className={styles.muted}>เมื่อตรวจครบแล้ว ให้ทำเครื่องหมายด้านบนเพื่อเปิดปุ่มยืนยันข้อมูล</p>}
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
                  บันทึกข้อมูลที่แก้ไข
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
                      const confirmationUrl = window.location.href;
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
                          await calculate(false);
                          if (window.location.href === confirmationUrl) setTab(1);
                        } catch (e) {
                          setError(
                            `ยืนยันแล้ว แต่ยังวิเคราะห์ต่อไม่ได้: ${e instanceof Error ? e.message : "กรุณาลองใหม่"}`,
                          );
                        }
                      } else setTab(1);
                    })
                  }
                >
                  ยืนยันผลการเรียน
                </button>
                <button
                  className={styles.secondary}
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void perform("กำลังยกเลิกร่าง", async () => {
                      if (!window.confirm("ยกเลิกและนำร่างนี้ออกจากรายการร่าง? ผลการเรียนที่ยืนยันแล้วและประวัติเดิมยังเก็บอยู่")) return;
                      await request(
                        `/api/student/transcripts/${draft.id}`,
                        { expectedVersion: draft.editVersion },
                        "DELETE",
                      );
                      setDraft(null);
                      setDraftDirty(false);
                      await reload();
                      setSuccess(draft.baseRevisionId ? "ยกเลิกการแก้ไขแล้ว ผลการเรียนเดิมยังอยู่" : "ลบร่างนำเข้าออกจากรายการแล้ว ยังไม่เปลี่ยนผลการเรียนที่ยืนยัน");
                    })
                  }
                >
                  {draft.baseRevisionId ? "ยกเลิกการแก้ไข" : "ลบร่างนำเข้านี้"}
                </button>
              </div>
            </section>
          )}
        </>
      )}
      {tab !== 0 && !analysis && <section className={styles.card} aria-label="สถานะแผนการเรียน">
        <h2>ยังไม่มีแผนการเรียนให้แสดง</h2>
        <p>{!workspace.revision ? "ยังไม่ได้ยืนยันผลการเรียน เริ่มจากอัปโหลด PDF ตรวจข้อมูล แล้วกดยืนยัน" : !workspace.dataset ? "ยังไม่มีข้อมูลหลักสูตรเผยแพร่ที่ตรงกับคุณ กรุณาติดต่อผู้ดูแลเพื่อเตรียมรายวิชาและการเปิดสอน" : "มีผลการเรียนแล้ว ตรวจเงื่อนไขด้านล่างและกดคำนวณแผนการเรียน"}</p>
        {!workspace.revision && <button className={styles.primary} onClick={() => setTab(0)}>กลับไปนำเข้าและยืนยันผลการเรียน</button>}
      </section>}
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
              เกรดที่ลองใช้กับวิชา A–F
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
              วางแผนล่วงหน้ากี่ภาค
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
            disabled={Boolean(busy) || !workspace.revision || !workspace.dataset}
            onClick={() =>
              void perform("กำลังวิเคราะห์และสร้างแผน", async () => {
                await calculate();
                setSuccess(
                  "คำนวณแผนแล้ว ตรวจรายละเอียดและข้อมูลที่ยังขาดก่อนใช้วางแผน",
                );
              })
            }
          >
            คำนวณแผนการเรียน
          </button>
          {!workspace.revision && (
            <p className={styles.note}>
              ยังไม่มีข้อมูลยืนยัน เริ่มที่นำเข้าและตรวจทานก่อน
            </p>
          )}
        </details>
      )}
      {analysis && audit && tab !== 0 && tab !== 5 && (
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
          <p className={styles.note}>
            <strong>สถานภาพตามข้อบังคับมหาวิทยาลัย: ยังไม่ยืนยัน</strong><br />
            APS แสดงความเสี่ยงเพื่อช่วยวางแผนเท่านั้น ไม่ตัดสินการพ้นสภาพ
            และไม่สรุปจำนวนครั้งรอพินิจจากประวัติที่อาจไม่ครบ กรุณาตรวจสถานภาพกับทะเบียน
          </p>
          <p className={styles.muted}>
            ที่มานโยบายที่ใช้คำนวณครั้งนี้: {analysis?.policy?.source || "ผลเดิมยังไม่ได้เก็บที่มานโยบาย กรุณาคำนวณใหม่เพื่อดูรายละเอียด"}
          </p>
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
          <div className={styles.overviewLinks}>
            <button type="button" className={styles.secondary} onClick={() => setTab(4)}>ดูรายวิชาที่ยังขาดและความก้าวหน้า</button>
            <button type="button" className={styles.secondary} onClick={() => setTab(5)}>เปรียบเทียบเส้นทางการศึกษา</button>
          </div>
          {audit.warnings.length > 0 && (
            <details className={`${styles.card} ${styles.detail}`}>
              <summary>ข้อจำกัดของผลชุดนี้ · {audit.warnings.length} รายการ</summary>
              <ul className={styles.list}>
                {audit.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      {tab === 4 && audit && analysis && <StudentProgress key={audit.track} audit={audit} catalogue={analysis.catalogue} />}
      {tab === 5 && analysis && <StudentTrackComparison analysis={analysis} stale={stale} onOpen={selected => { setTrack(selected); setComparison(null); setTab(2); }} />}
      {tab === 2 && plan && audit && analysis && <StudentPlanner key={plan.track} plan={plan} audit={audit} catalogue={analysis.catalogue} />}
      {(tab === 1 || tab === 5) && workspace.enrollment && <StudentTrackCriteria key={`${parameters.currentTerm.year}/${parameters.currentTerm.semester}/${workspace.revision?.id}`} year={parameters.currentTerm.year} semester={parameters.currentTerm.semester} revisionId={workspace.revision?.id} />}
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
                  <span>ภาคจบตามแผนเดิม</span>
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
