"use client";

import { publicationReadiness } from "@/modules/curriculum/publication-readiness";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { HistoryQuery } from "@/modules/curriculum/history";
import {
  CATEGORY_NAMES,
  TRACK_NAMES,
  type Course,
  type Dataset,
  type DatasetHistory,
  type StudyTrack,
  type CourseCategory,
} from "@/modules/curriculum/types";
import { csvCell, COURSE_COLUMNS } from "@/modules/curriculum/csv";
import { parseCourse, validateDataset } from "@/modules/curriculum/validation";
import styles from "./academic-ui.module.css";
import { useUnsavedChanges } from "./use-unsaved-changes";
type State = DatasetHistory;
const datasetStatusNames = { draft: "ร่าง", published: "เผยแพร่แล้ว", withdrawn: "ยกเลิกใช้" };
type Preview = {
  rows: { row: number; course: Course | null; error: string | null }[];
  valid: boolean;
  accepted: number;
  total: number;
};
const emptyCourse = (): Course => ({
  code: "",
  name: "",
  credits: 3,
  category: "unmapped",
  tracks: [],
  grading: "unknown",
  specific: false,
  prerequisite: {
    mode: "all",
    courses: [],
    concurrent: false,
    unresolved: null,
  },
  requiresConsent: false,
  source: "",
});
class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function api<T>(body?: unknown, url = "/api/admin/academic", signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal,
  });
  const output = await response.json();
  if (!response.ok)
    throw new RequestError(output.error?.message || "ทำรายการไม่สำเร็จ", response.status);
  return output;
}
export function AcademicManager({ initial }: { initial: State }) {
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [state, setState] = useState(initial),
    [versionId, setVersionId] = useState(initial.selectedVersionId ?? ""),
    [dataset, setDataset] = useState<Dataset | null>(null);
  const [tab, setTab] = useState(0),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(initial.datasets.length ? "กำลังโหลดฉบับข้อมูล" : "");
  const locked = useRef(Boolean(initial.datasets.length));
  const requestNumber = useRef(0);
  const readController = useRef<AbortController | null>(null);
  const [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [form, setForm] = useState<Course>(emptyCourse()),
    [editingCode, setEditingCode] = useState<string | null>(null),
    [search, setSearch] = useState("");
  const [year, setYear] = useState(2569),
    [recurring, setRecurring] = useState(false),
    [offeringSource, setOfferingSource] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [conflict, setConflict] = useState(false);
  const editable = dataset?.status === "draft" && !busy;
  useUnsavedChanges(dirty);
  function openVersionSelection() {
    const selection = document.getElementById("academic-version-selection");
    const input = document.getElementById("academic-dataset-select") as HTMLSelectElement | null;
    if (input && !input.disabled) input.focus({ preventScroll: true });
    else selection?.focus({ preventScroll: true });
    selection?.scrollIntoView({ block: "start" });
  }
  function openWorkTab(index: number) {
    setTab(index);
    document.getElementById("academic-work-tabs")?.focus();
  }
  useEffect(() => {
    const id = initial.datasets[0]?.id;
    if (!id) return;
    const controller = new AbortController(); readController.current = controller;
    const number = ++requestNumber.current;
    api<Dataset>(undefined, `/api/admin/academic/${id}`, controller.signal)
      .then(data => { if (number === requestNumber.current) setDataset(data); })
      .catch(e => { if (!controller.signal.aborted && number === requestNumber.current) setError(e instanceof Error ? e.message : "โหลดฉบับข้อมูลไม่สำเร็จ"); })
      .finally(() => { if (!controller.signal.aborted && number === requestNumber.current) { setBusy(""); locked.current = false; } });
    return () => { readController.current?.abort(); };
  }, [initial]);
  async function run(label: string, action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(label);
    setError("");
    setSuccess("");
    setConflict(false);
    try {
      await action();
    } catch (e) {
      setConflict(e instanceof RequestError && e.status === 409);
      setError(e instanceof TypeError || e instanceof SyntaxError
        ? "เชื่อมต่อหรืออ่านคำตอบจากระบบไม่ได้ ข้อมูลที่กรอกยังอยู่ กรุณาลองอีกครั้ง"
        : e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
    } finally {
      locked.current = false;
      setBusy("");
    }
  }
  function resetEditor() {
    setPreview(null); setForm(emptyCourse()); setEditingCode(null); setSearch("");
  }
  function beginRead() {
    readController.current?.abort();
    const controller = new AbortController(); readController.current = controller;
    return { controller, number: ++requestNumber.current };
  }
  async function loadHistory(query: HistoryQuery, selectedId?: string) {
    const { controller, number } = beginRead();
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value));
    const next = await api<State>(undefined, `/api/admin/academic?${params}`, controller.signal);
    const id = selectedId ?? next.datasets[0]?.id;
    const detail = id ? await api<Dataset>(undefined, `/api/admin/academic/${id}`, controller.signal) : null;
    if (number !== requestNumber.current) return;
    setState(next); setVersionId(next.selectedVersionId ?? ""); setDataset(detail); resetEditor();
  }
  async function openDataset(id: string) {
    const { controller, number } = beginRead();
    const detail = id ? await api<Dataset>(undefined, `/api/admin/academic/${id}`, controller.signal) : null;
    if (number === requestNumber.current) { setDataset(detail); resetEditor(); }
  }
  async function refresh(selectedId = dataset?.id) {
    // Anchor the visible window so another admin's new draft cannot shift this page.
    await loadHistory({ versionId, ...(state.pageInfo.newestVersion !== null ? { beforeVersion: state.pageInfo.newestVersion + 1 } : {}) }, selectedId);
  }
  function modify(change: (d: Dataset) => Dataset) {
    setDataset((previous) => (previous ? change(previous) : null));
    setDirty(true);
    setPreview(null);
  }
  async function save() {
    if (!dataset) return null;
    const output = await api<Dataset>({
      action: "save",
      id: dataset.id,
      expectedVersion: dataset.editVersion,
      dataset,
    });
    setDataset(output);
    setDirty(false);
    await refresh(output.id);
    return output;
  }
  function courseSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const course = parseCourse(form);
      if (!dataset) return;
      if (
        dataset.courses.some(
          (c) => c.code === course.code && c.code !== editingCode,
        )
      )
        throw new Error("รหัสวิชาซ้ำในชุดข้อมูล");
      modify((d) => ({
        ...d,
        courses: editingCode
          ? d.courses.map((c) => (c.code === editingCode ? course : c))
          : [...d.courses, course],
      }));
      setForm(emptyCourse());
      setEditingCode(null);
      setSuccess("แก้รายวิชาในร่างบนหน้าจอแล้ว กดบันทึกร่างเพื่อเก็บลงระบบ");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function removeCourse(course: Course) {
    if (!dataset || !editable) return;
    const dependants = dataset.courses.filter(item => item.prerequisite.courses.includes(course.code));
    if (dependants.length || dataset.offerings.some(item => item.courseCode === course.code) || dataset.policy.starGradeCourses?.includes(course.code)) {
      setError(`ยังลบ ${course.code} ไม่ได้: ตรวจวิชาที่อ้างเป็นเงื่อนไข (${dependants.map(item => item.code).join(", ") || "ไม่มี"}) รายการเปิดสอน และรายการ S*/U* ในเงื่อนไขการเรียนก่อน`);
      return;
    }
    if (!window.confirm(`ลบ ${course.code} · ${course.name} ออกจากร่างนี้? ฉบับอื่นไม่เปลี่ยน และต้องกดบันทึกร่างจึงมีผล`)) return;
    modify(d => ({ ...d, courses: d.courses.filter(item => item.code !== course.code) }));
    if (editingCode === course.code) { setForm(emptyCourse()); setEditingCode(null); }
    setError("");
    setSuccess(`ลบ ${course.code} จากร่างบนหน้าจอแล้ว ยังไม่บันทึก หากต้องการคืนให้กดยกเลิกการแก้ไขที่ยังไม่บันทึก`);
  }
  function setOffering(
    code: string,
    semester: 1 | 2 | 3,
    availability: "open" | "closed" | "unknown",
  ) {
    if (!offeringSource.trim()) {
      setError("ระบุแหล่งข้อมูลหรือที่มาของสมมติฐานการเปิดสอนก่อนแก้ตาราง");
      return;
    }
    const actualYear = recurring ? 0 : year;
    modify((d) => ({
      ...d,
      offerings: [
        ...d.offerings.filter(
          (o) =>
            !(
              o.courseCode === code &&
              o.year === actualYear &&
              o.semester === semester
            ),
        ),
        {
          courseCode: code,
          year: actualYear,
          semester,
          availability,
          confidence: "planned",
          source: offeringSource.trim(),
        },
      ],
    }));
  }
  function importFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dataset) return;
    const body = new FormData(event.currentTarget);
    body.set("datasetId", dataset.id);
    setPreview(null);
    void run("กำลังตรวจไฟล์นำเข้า", async () => {
      const response = await fetch("/api/admin/academic/import", {
        method: "POST",
        body,
      });
      const output = await response.json();
      if (!response.ok)
        throw new Error(output.error?.message || "อ่านไฟล์ไม่สำเร็จ");
      setPreview(output);
    });
  }
  function exportCourses() {
    if (!dataset) return;
    const lines = [
      COURSE_COLUMNS.join(","),
      ...dataset.courses.map((c) =>
        [
          c.code,
          c.name,
          c.credits,
          c.category,
          c.tracks.join(";"),
          c.grading,
          c.specific,
          c.prerequisite.mode,
          c.prerequisite.courses.join(";"),
          c.prerequisite.concurrent,
          c.requiresConsent,
          c.source,
        ]
          .map(csvCell)
          .join(","),
      ),
    ];
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + lines.join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "aps-courses.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className={styles.workspace} aria-busy={Boolean(busy)}>
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>พื้นที่ผู้ดูแลข้อมูลวิชาการ</span>
          <h1>หลักสูตรและการเปิดสอน</h1>
          <p>
            เพิ่มรายวิชา กำหนดเงื่อนไขและการเปิดสอน แล้วตรวจข้อมูลก่อนให้นักศึกษาใช้วางแผน
          </p>
        </div>
      </div>
      <ol className={`${styles.journey} ${styles.journeyNavigation}`} aria-label="ขั้นตอนจัดเตรียมหลักสูตร">
        <li aria-current={!dataset ? "step" : undefined}><button type="button" onClick={openVersionSelection}>1 เลือกฉบับ</button></li>
        <li aria-current={dataset && tab !== 4 ? "step" : undefined}><button type="button" disabled={!dataset || Boolean(busy)} onClick={() => openWorkTab(0)}>2 แก้ข้อมูลและตรวจปัญหา</button></li>
        <li aria-current={dataset && tab === 4 ? "step" : undefined}><button type="button" disabled={!dataset || Boolean(busy)} onClick={() => openWorkTab(4)}>3 ตรวจความพร้อมและเผยแพร่</button></li>
      </ol>
      <section className={styles.nextStep} aria-labelledby="admin-next-step">
        <div>
          <span className={styles.eyebrow}>เริ่มจัดเตรียมข้อมูล</span>
          <h2 id="admin-next-step">{!dataset ? "เลือกหลักสูตรและเปิดชุดข้อมูลด้านล่าง" : dataset.status === "withdrawn" ? "ฉบับนี้ยกเลิกใช้แล้ว ประวัติยังอยู่" : dataset.status === "published" ? "ฉบับนี้เผยแพร่แล้ว เริ่มแก้ด้วยสำเนาร่างใหม่" : dirty ? "มีการแก้ไขที่ยังไม่บันทึก" : "เตรียมข้อมูลให้นักศึกษาใช้วางแผน"}</h2>
          <p>{dataset?.status === "withdrawn" ? "ฉบับนี้ไม่ถูกใช้สร้างแผนใหม่ หากต้องการนำข้อมูลกลับมาใช้ ให้สร้างสำเนาเป็นร่างใหม่ ตรวจและเผยแพร่ตามขั้นตอน" : dataset?.status === "published" ? "หากต้องการแก้ไข ให้กดสร้างสำเนาเป็นร่างใหม่ นักศึกษายังใช้ฉบับเดิมได้ระหว่างที่คุณแก้" : "เริ่มจากนำเข้ารายวิชาหรือแก้รายการที่มีอยู่ บันทึกงาน แล้วตรวจการเปิดสอนและวิธีคำนวณก่อนเผยแพร่ให้นักศึกษาใช้"}</p>
        </div>
        {dataset?.status === "draft" && <div className={styles.actions}>
          <button className={styles.primary} disabled={Boolean(busy)} onClick={() => openWorkTab(3)}>เริ่มนำเข้าไฟล์รายวิชา</button>
          <button className={styles.secondary} disabled={Boolean(busy)} onClick={() => openWorkTab(2)}>ตรวจการเปิดสอน</button>
          <button className={styles.secondary} disabled={Boolean(busy)} onClick={() => openWorkTab(4)}>ไปตรวจความพร้อม</button>
        </div>}
      </section>
      <div role="status" aria-live="polite">
        {busy && <p className={styles.note}>{busy}…</p>}
        {success && <p className={styles.success}>{success}</p>}
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {conflict && <p className={styles.note}>ข้อมูลที่แก้ยังอยู่ในแท็บนี้ อย่ารีเฟรชก่อนตรวจทาน <a href="/admin/academic" target="_blank" rel="noreferrer">เปิดฉบับล่าสุดในแท็บใหม่</a> เพื่อเลือกฉบับเดิม เทียบและย้ายเฉพาะส่วนที่ต้องการแก้ แล้วบันทึกจากฉบับล่าสุด ระบบจะไม่เขียนทับข้อมูลจากอีกแท็บให้อัตโนมัติ</p>}
      <section className={styles.card} id="academic-version-selection" tabIndex={-1} aria-labelledby="academic-version-heading">
        <h2 id="academic-version-heading">เลือกหลักสูตร</h2>
        {dirty && <p className={styles.note}>มีร่างที่ยังไม่บันทึก กรุณาบันทึกร่างข้อมูลก่อนเปลี่ยนฉบับ</p>}
        <div className={styles.form}>
          <label className={styles.field}>
            หลักสูตรที่ดูแล
            <select
              value={versionId}
              disabled={Boolean(busy) || dirty}
              onChange={(e) => { const id = e.target.value; void run("กำลังโหลดประวัติหลักสูตร", () => loadHistory({ versionId: id })); }}
            >
              {state.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.curriculumCode.startsWith("CS2565-DEMO-") ? "วิทยาการคอมพิวเตอร์ 2565 · ชุดฝึกใช้งาน" : `${v.curriculumCode} · ${v.code}`}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            ชุดข้อมูลที่เปิดดู
            <select
              id="academic-dataset-select"
              value={dataset?.id ?? ""}
              disabled={Boolean(busy) || dirty}
              onChange={(e) => { const id = e.target.value; void run("กำลังโหลดฉบับข้อมูล", () => openDataset(id)); }}
            >
              <option value="">ยังไม่เลือก</option>
              {dataset && !state.datasets.some(d => d.id === dataset.id) && <option value={dataset.id}>ฉบับ {dataset.version} · {datasetStatusNames[dataset.status]} · เปิดอยู่</option>}
              {state.datasets
                .filter((d) => d.curriculumVersionId === versionId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    ฉบับ {d.version} ·{" "}
                    {datasetStatusNames[d.status]}
                    {" · "}{new Date(d.createdAt).toLocaleDateString("th-TH")}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div className={styles.actions} aria-label="เลื่อนประวัติชุดข้อมูล">
          <button className={styles.secondary} disabled={Boolean(busy) || dirty || !state.pageInfo.hasNewer}
            onClick={() => void run("กำลังโหลดฉบับที่ใหม่กว่า", () => loadHistory({ versionId, afterVersion: state.pageInfo.newestVersion! }))}>ใหม่กว่านี้</button>
          <button className={styles.secondary} disabled={Boolean(busy) || dirty || !state.pageInfo.hasOlder}
            onClick={() => void run("กำลังโหลดฉบับที่เก่ากว่า", () => loadHistory({ versionId, beforeVersion: state.pageInfo.oldestVersion! }))}>เก่ากว่านี้</button>
          <p className={styles.note}>{state.datasets.length ? `แสดง ${state.datasets.length} ชุด · ฉบับ ${state.pageInfo.newestVersion}–${state.pageInfo.oldestVersion}` : "ยังไม่มีชุดข้อมูลของฉบับหลักสูตรนี้"}</p>
        </div>
        <div className={styles.actions}>
          <button
            className={styles.secondary}
            disabled={Boolean(busy) || dirty || !versionId}
            onClick={() =>
              void run("กำลังสร้างร่างหลักสูตร", async () => {
                const created = await api<Dataset>({
                  action: "create",
                  versionId,
                });
                setDataset(created);
                setDirty(false);
                await loadHistory({ versionId }, created.id);
                setSuccess(
                  state.versions.find(v => v.id === versionId)?.curriculumCode === "CS2565"
                    ? "สร้างร่าง CS2565 แล้ว ตรวจข้อมูลก่อนเผยแพร่"
                    : "สร้างร่างแล้ว ตรวจข้อมูลและค่าเริ่มต้นก่อนเผยแพร่",
                );
              })
            }
          >
            {state.versions.find(v => v.id === versionId)?.curriculumCode === "CS2565" ? "สร้างร่าง CS2565 เริ่มต้น" : "สร้างร่างว่างของหลักสูตรนี้"}
          </button>
          <button
            className={styles.secondary}
            disabled={Boolean(busy) || dirty || !dataset}
            onClick={() =>
              void run("กำลังสร้างสำเนาร่าง", async () => {
                const created = await api<Dataset>({
                  action: "create",
                  versionId: dataset!.curriculumVersionId,
                  copyId: dataset!.id,
                });
                setDataset(created);
                setDirty(false);
                await loadHistory({ versionId: created.curriculumVersionId }, created.id);
                setSuccess("สร้างร่างฉบับใหม่แล้ว ฉบับเดิมไม่เปลี่ยน");
              })
            }
          >
            สร้างสำเนาเป็นร่างใหม่
          </button>
        </div>
        {!state.versions.length && (
          <p className={styles.note}>
            ยังไม่มีสิทธิ์หลักสูตร กรุณาให้ผู้ดูแลหลักมอบหมายก่อน
          </p>
        )}
      </section>
      {dataset && (
        <>
          <section className={styles.card}>
            <div className={styles.hero}>
              <div>
                <h2>ชุดข้อมูลฉบับ {dataset.version}</h2>
                <p>
                  {dataset.courses.length} รายวิชา ·{" "}
                  {dataset.status === "withdrawn" ? "ฉบับยกเลิกใช้ อ่านได้อย่างเดียว" : dataset.status === "published"
                    ? "ฉบับเผยแพร่ อ่านได้อย่างเดียว"
                    : "ร่างที่แก้ไขได้"}
                </p>
              </div>
              <span className={styles.badge}>
                {dirty
                  ? "มีการแก้ที่ยังไม่บันทึก"
                  : dataset.status === "draft" ? "ยังไม่เผยแพร่" : datasetStatusNames[dataset.status]}
              </span>
            </div>
            <label className={styles.field}>
              แหล่งข้อมูลหลักสูตร
              <input
                value={dataset.source}
                disabled={!editable}
                onChange={(e) =>
                  modify((d) => ({ ...d, source: e.target.value }))
                }
              />
            </label>
            {dataset.unresolved.length > 0 && (
              <details className={styles.note}><summary>ข้อมูลที่ยังต้องยืนยัน {dataset.unresolved.length} รายการ</summary>
                <strong>กฎและข้อมูลที่ยังต้องยืนยัน</strong>
                <ul className={styles.list}>
                  {dataset.unresolved.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p>
                  เผยแพร่ข้อมูลได้เฉพาะความสามารถที่มีข้อมูลรองรับ
                  หากเงื่อนไขยังไม่ครบ ระบบจะแจ้งว่าผลส่วนใดยังคำนวณไม่ได้
                </p>
              </details>
            )}
            <div className={styles.actions}>
              <button
                className={styles.primary}
                disabled={!editable || !dirty}
                onClick={() =>
                  void run("กำลังบันทึกชุดข้อมูล", async () => {
                    await save();
                    setSuccess("บันทึกร่างแล้ว ยังไม่เผยแพร่");
                  })
                }
              >
                บันทึกร่างข้อมูล
              </button>
              {dataset.status !== "withdrawn" && <button type="button" className={styles.secondary} disabled={Boolean(busy) || dirty} onClick={() => {
                if (!window.confirm(`ยกเลิกใช้ฉบับ ${dataset.version}? เก็บรายวิชาและประวัติเดิมไว้ ระบบจะใช้ฉบับเผยแพร่อื่นที่ยังใช้งานได้ หรือแจ้งว่าไม่มีหลักสูตรพร้อมวิเคราะห์`)) return;
                void run("กำลังยกเลิกใช้ฉบับ", async () => { await api({ action: "withdraw", id: dataset.id, expectedVersion: dataset.editVersion }); await refresh(dataset.id); setSuccess("ยกเลิกใช้ฉบับแล้ว ข้อมูลและประวัติเดิมยังอยู่"); });
              }}>{dataset.status === "draft" ? "ยกเลิกร่างฉบับนี้" : "ยกเลิกใช้ฉบับนี้"}</button>}
              <button type="button" className={styles.secondary} disabled={!editable || !dirty} onClick={() => {
                if (!dataset || !window.confirm("ทิ้งการแก้ไขทั้งหมดที่ยังไม่บันทึก แล้วอ่านฉบับนี้ล่าสุดจากระบบ?")) return;
                void run("กำลังอ่านร่างล่าสุด", async () => { await openDataset(dataset.id); setDirty(false); setSuccess("ยกเลิกการแก้ไขที่ยังไม่บันทึกแล้ว โหลดฉบับล่าสุดจากระบบ"); });
              }}>ยกเลิกการแก้ไขที่ยังไม่บันทึก</button>
              <button
                className={styles.secondary}
                hidden={tab !== 4}
                disabled={!editable || dirty}
                onClick={() =>
                  void run("กำลังตรวจและเผยแพร่", async () => {
                    const errors = validateDataset(dataset);
                    if (errors.length)
                      throw new Error(errors.slice(0, 8).join("; "));
                    const output = await api<{ limitations: string[] }>({
                      action: "publish",
                      id: dataset.id,
                      expectedVersion: dataset.editVersion,
                    });
                    await refresh(dataset.id);
                    setSuccess(
                      output.limitations.length
                        ? "เผยแพร่แล้ว บางผลยังมีข้อจำกัดจากเงื่อนไขที่ยังไม่ยืนยัน"
                        : "เผยแพร่ชุดข้อมูลแล้ว ยังต้องตรวจผลกับกรณีทดสอบ",
                    );
                  })
                }
              >
                ตรวจและเผยแพร่ฉบับ
              </button>
            </div>
          </section>
          <nav className={styles.tabs} aria-label="จัดข้อมูลวิชาการ" id="academic-work-tabs" tabIndex={-1}>
            {[
              "รายวิชา",
              "เงื่อนไขการเรียน",
              "การเปิดสอน",
              "นำเข้า Excel/CSV",
              "ตรวจและเผยแพร่",
            ].map((name, index) => (
              <button
                key={name}
                type="button"
                aria-pressed={tab === index}
                onClick={() => setTab(index)}
              >
                {name}
              </button>
            ))}
          </nav>
          {tab === 4 && <section className={styles.card}><h2>ตรวจความพร้อมก่อนเผยแพร่</h2><p>เมื่อเผยแพร่ นักศึกษาจะใช้ข้อมูลชุดนี้คำนวณแผน ฉบับที่เผยแพร่แล้วแก้ทับไม่ได้</p><ul><li>รายวิชา {dataset.courses.length} วิชา</li><li>รายการเปิดสอน {dataset.offerings.length} รายการ</li><li>ข้อมูลที่ยังต้องยืนยัน {dataset.unresolved.length} รายการ</li></ul>{!dataset.offerings.length && <p className={styles.error}>ยังไม่มีข้อมูลเปิดสอน แผนอาจจัดวิชาไม่ได้ กรุณาเตรียมข้อมูลหรือให้นักศึกษาระบุสมมติฐานแยกจากข้อมูลจริง</p>}{validateDataset(dataset).length > 0 && <ul className={styles.error}>{validateDataset(dataset).map((message,index)=><li key={index}>{message}</li>)}</ul>}<p>{dirty ? "มีข้อมูลที่ยังไม่บันทึก กรุณาบันทึกร่างก่อนเผยแพร่" : "ตรวจรายการข้างต้น แล้วใช้ปุ่มตรวจและเผยแพร่ฉบับด้านบน"}</p></section>}
          {tab === 4 && (
            <section className={styles.card} aria-label="ความสามารถที่ยังมีข้อจำกัด">
              <h3>เผยแพร่แล้วคำนวณส่วนใดได้บ้าง</h3>
              <p>ใช้ CS2565 เป็นข้อมูลตั้งต้น ข้อมูลเพิ่มเติมเป็นหน้าที่ผู้ดูแลบันทึกพร้อมแหล่งที่มา การเผยแพร่ไม่ได้ยืนยันกฎที่ยังขาด และไม่ได้อนุมัติจบหรือลงทะเบียน</p>
              <p>{publicationReadiness(dataset).capabilities.confirmedGpa
                ? "GPA: คำนวณตามนโยบายที่บันทึกไว้ ไม่ใช่การรับรองผลจากมหาวิทยาลัย"
                : "GPA: แสดงได้เฉพาะผลตรวจเบื้องต้น ยังมีนโยบายคำนวณที่ไม่ยืนยัน"}</p>
              <ul>{publicationReadiness(dataset).limitations.map((item, index) => (
                <li key={index}><strong>{item.rule}</strong><br />ยังไม่ยืนยัน: {item.affects}</li>
              ))}</ul>
              <p>ผลสรุปการศึกษา: ยังไม่รับรอง แม้ไม่มีรายการค้างในช่องนี้</p>
            </section>
          )}
          {tab === 0 && (
            <section className={styles.card}>
              <h2>
                {editingCode
                  ? `แก้รายวิชา ${editingCode}`
                  : "เพิ่มรายวิชาในร่าง"}
              </h2>
              <form onSubmit={courseSubmit}>
                <div className={styles.form}>
                  <label className={styles.field}>
                    รหัสวิชา
                    <input
                      required
                      value={form.code}
                      disabled={!editable || Boolean(editingCode)}
                      onChange={(e) =>
                        setForm({ ...form, code: e.target.value.toUpperCase() })
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    ชื่อรายวิชา
                    <input
                      required
                      value={form.name}
                      disabled={!editable}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    หน่วยกิต
                    <input
                      required
                      type="number"
                      min="0"
                      max="30"
                      value={form.credits}
                      disabled={!editable}
                      onChange={(e) =>
                        setForm({ ...form, credits: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    หมวดที่จัดสรร
                    <select
                      value={form.category}
                      disabled={!editable}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          category: e.target.value as CourseCategory,
                        })
                      }
                    >
                      {Object.entries(CATEGORY_NAMES).map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    นโยบายเกรดรายวิชา
                    <select
                      value={form.grading}
                      disabled={!editable}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          grading: e.target.value as Course["grading"],
                        })
                      }
                    >
                      <option value="unknown">ยังไม่ยืนยัน</option>
                      <option value="numeric">เกรดตัวเลข A–F</option>
                      <option value="su">S/U</option>
                    </select>
                  </label>
                  <label className={styles.field}>
                    สายที่ใช้วิชานี้
                    <select
                      value={form.tracks.length === 1 ? form.tracks[0] : "both"}
                      disabled={!editable}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          tracks:
                            e.target.value === "both"
                              ? []
                              : [e.target.value as StudyTrack],
                        })
                      }
                    >
                      <option value="both">ทั้งสองสาย</option>
                      {Object.entries(TRACK_NAMES).map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    เงื่อนไขวิชาก่อน
                    <select
                      value={form.prerequisite.mode}
                      disabled={!editable}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          prerequisite: {
                            ...form.prerequisite,
                            mode: e.target.value as "all" | "any",
                          },
                        })
                      }
                    >
                      <option value="all">ต้องผ่านทุกวิชาที่ระบุ</option>
                      <option value="any">ผ่านอย่างน้อยหนึ่งวิชาที่ระบุ</option>
                    </select>
                  </label>
                  <label className={styles.field}>
                    รหัสวิชาก่อน คั่นด้วยจุลภาค
                    <input
                      value={form.prerequisite.courses.join(", ")}
                      disabled={!editable}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          prerequisite: {
                            ...form.prerequisite,
                            courses: e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          },
                        })
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    เงื่อนไขเพิ่มเติมที่ยังไม่ยืนยัน
                    <input
                      value={form.prerequisite.unresolved ?? ""}
                      disabled={!editable}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          prerequisite: {
                            ...form.prerequisite,
                            unresolved: e.target.value || null,
                          },
                        })
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    แหล่งกฎ / หน้าเอกสาร
                    <input
                      required
                      value={form.source}
                      disabled={!editable}
                      onChange={(e) =>
                        setForm({ ...form, source: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={form.specific}
                    disabled={!editable}
                    onChange={(e) =>
                      setForm({ ...form, specific: e.target.checked })
                    }
                  />
                  นับเป็นวิชาเฉพาะด้านสำหรับ GPA แม้จัดสรรหน่วยกิตเป็นเลือกเสรี
                </label>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={form.prerequisite.concurrent}
                    disabled={!editable}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        prerequisite: {
                          ...form.prerequisite,
                          concurrent: e.target.checked,
                        },
                      })
                    }
                  />
                  เอกสารระบุให้เรียนพร้อมวิชาก่อนได้
                </label>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={form.requiresConsent}
                    disabled={!editable}
                    onChange={(e) =>
                      setForm({ ...form, requiresConsent: e.target.checked })
                    }
                  />
                  ต้องได้รับความยินยอมจากผู้มีอำนาจทางวิชาการ
                </label>
                <div className={styles.actions}>
                  <button className={styles.primary} disabled={!editable}>
                    {editingCode
                      ? "ใช้การแก้รายวิชาในร่าง"
                      : "เพิ่มรายวิชาในร่าง"}
                  </button>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => {
                      setForm(emptyCourse());
                      setEditingCode(null);
                    }}
                  >
                    ล้างฟอร์มรายวิชา
                  </button>
                </div>
              </form>
              <div className={styles.form}>
              <label className={styles.field}>
                ค้นหารหัสหรือชื่อวิชา
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <label className={styles.field}>กรองหมวดรายวิชา<select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option value="all">ทุกหมวด</option>{Object.entries(CATEGORY_NAMES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              </div>
              <p className={styles.muted} role="status">พบ {dataset.courses.filter(course => `${course.code} ${course.name}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) && (categoryFilter === "all" || course.category === categoryFilter)).length} รายวิชา · หลักสูตรฉบับ {dataset.version}</p>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>รายวิชา</th>
                      <th>หน่วยกิต / หมวด</th>
                      <th>เงื่อนไข</th>
                      <th>การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataset.courses
                      .filter((c) => `${c.code} ${c.name}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) && (categoryFilter === "all" || c.category === categoryFilter))
                      .map((c) => (
                        <tr key={c.code}>
                          <td>
                            {c.code} · {c.name}
                          </td>
                          <td>
                            {c.credits} · {CATEGORY_NAMES[c.category]}
                          </td>
                          <td>
                            {c.prerequisite.courses.join(
                              c.prerequisite.mode === "any"
                                ? " หรือ "
                                : " และ ",
                            ) || "ไม่มีวิชาก่อนที่ระบุ"}
                          </td>
                          <td>
                            <button
                              className={styles.secondary}
                              disabled={!editable}
                              onClick={() => {
                                setForm(structuredClone(c));
                                setEditingCode(c.code);
                              }}
                            >
                              แก้ {c.code}
                            </button>
                            <button type="button" className={styles.secondary} disabled={!editable} onClick={() => removeCourse(c)}>ลบ {c.code} จากร่าง</button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {tab === 1 && (
            <section className={styles.card}>
              <h2>ขั้นต่ำของหมวดและนโยบายคำนวณ</h2>
              <p className={styles.note}>
                ระบุที่มาว่าเป็นเอกสารหรือข้อตกลงสำหรับ APS ให้ชัดเจน
                ค่าวินิจฉัยไม่แทนเกณฑ์มหาวิทยาลัย
              </p>
              <div className={styles.form}>
                <label className={styles.field}>
                  คะแนนเกรดสูงสุดที่อาจเรียนซ้ำได้
                  <input
                    type="number"
                    min="0"
                    max="4"
                    step="0.5"
                    value={dataset.policy.retakeCeiling ?? ""}
                    disabled={!editable}
                    onChange={(e) =>
                      modify((d) => ({
                        ...d,
                        policy: {
                          ...d.policy,
                          retakeCeiling:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        },
                      }))
                    }
                  />
                </label>
                <label className={styles.field}>
                  หน่วยกิตขั้นต่ำทั้งหมด
                  <input
                    type="number"
                    min="1"
                    value={dataset.policy.degreeCredits}
                    disabled={!editable}
                    onChange={(e) =>
                      modify((d) => ({
                        ...d,
                        policy: {
                          ...d.policy,
                          degreeCredits: Number(e.target.value),
                        },
                      }))
                    }
                  />
                </label>
                <label className={styles.field}>
                  GPA ขั้นต่ำ
                  <input
                    type="number"
                    min="0"
                    max="4"
                    step="0.01"
                    value={dataset.policy.gpaMinimum}
                    disabled={!editable}
                    onChange={(e) =>
                      modify((d) => ({
                        ...d,
                        policy: {
                          ...d.policy,
                          gpaMinimum: Number(e.target.value),
                        },
                      }))
                    }
                  />
                </label>
                <label className={styles.field}>
                  วิธีคิด GPA เมื่อเรียนซ้ำ
                  <select
                    value={dataset.policy.repeat}
                    disabled={!editable}
                    onChange={(e) =>
                      modify((d) => ({
                        ...d,
                        policy: {
                          ...d.policy,
                          repeat: e.target.value as Dataset["policy"]["repeat"],
                        },
                      }))
                    }
                  >
                    <option value="unconfirmed">
                      ยังไม่ยืนยัน (วินิจฉัยด้วยผลตัวเลขล่าสุด)
                    </option>
                    <option value="latest_numeric">
                      ผลตัวเลขล่าสุด ตามแหล่งที่ยืนยัน
                    </option>
                    <option value="all_attempts">
                      ทุกครั้ง ตามแหล่งที่ยืนยัน
                    </option>
                  </select>
                </label>
                <label className={styles.field}>
                  การปัด GPA เพื่อแสดงผล
                  <select
                    value={dataset.policy.rounding}
                    disabled={!editable}
                    onChange={(e) =>
                      modify((d) => ({
                        ...d,
                        policy: {
                          ...d.policy,
                          rounding: e.target
                            .value as Dataset["policy"]["rounding"],
                        },
                      }))
                    }
                  >
                    <option value="unconfirmed">ยังไม่ยืนยัน</option>
                    <option value="half_up_2">
                      ปัดครึ่งขึ้นสองตำแหน่ง
                    </option>
                  </select>
                </label>
                <label className={styles.field}>
                  การจัดหมวดวิชาเลือก
                  <select value={dataset.policy.electiveAllocation ?? "unconfirmed"} disabled={!editable}
                    onChange={(e) => modify((d) => ({ ...d, policy: { ...d.policy, electiveAllocation: e.target.value as Dataset["policy"]["electiveAllocation"] } }))}>
                    <option value="unconfirmed">ยังไม่ยืนยันการจัดวิชาเกินไปเลือกเสรี</option>
                    <option value="specific_then_free_earliest_pass">เลือกเฉพาะก่อน แล้วเลือกเสรี ตามภาคที่ผ่านและรหัส</option>
                  </select>
                </label>
                <label className={styles.field}>
                  การเทียบเกณฑ์ GPA
                  <select value={dataset.policy.gpaComparison ?? "unconfirmed"} disabled={!editable}
                    onChange={(e) => modify((d) => ({ ...d, policy: { ...d.policy, gpaComparison: e.target.value as Dataset["policy"]["gpaComparison"] } }))}>
                    <option value="unconfirmed">ยังไม่ยืนยัน (วินิจฉัยด้วยค่าก่อนปัด)</option>
                    <option value="raw">เทียบค่าก่อนปัด</option>
                  </select>
                </label>
                <label className={styles.field}>
                  ขอบเขต GPA เฉพาะด้าน
                  <select value={dataset.policy.specificGpaBasis ?? "unconfirmed"} disabled={!editable}
                    onChange={(e) => modify((d) => ({ ...d, policy: { ...d.policy, specificGpaBasis: e.target.value as Dataset["policy"]["specificGpaBasis"] } }))}>
                    <option value="unconfirmed">ยังไม่ยืนยันเมื่อเรียนเกินขั้นต่ำ</option>
                    <option value="all_specific">ทุกวิชาเฉพาะด้าน รวมที่เรียนเกินขั้นต่ำ</option>
                  </select>
                </label>
                <label className={styles.field}>
                  รหัสวิชาที่รับรอง S*/U* เทียบ S/U คั่นด้วยจุลภาค
                  <input value={(dataset.policy.starGradeCourses ?? []).join(",")} disabled={!editable}
                    onChange={(e) => modify((d) => ({ ...d, policy: { ...d.policy, starGradeCourses: e.target.value ? e.target.value.split(",").map(c => c.trim()) : [] } }))} />
                </label>
                <label className={styles.field}>
                  สิทธิ์วิชาต่อเนื่องเมื่อเรียนซ้ำ
                  <select
                    value={dataset.policy.prerequisitePass}
                    disabled={!editable}
                    onChange={(e) =>
                      modify((d) => ({
                        ...d,
                        policy: {
                          ...d.policy,
                          prerequisitePass: e.target
                            .value as Dataset["policy"]["prerequisitePass"],
                        },
                      }))
                    }
                  >
                    <option value="unconfirmed">ยังไม่ยืนยัน</option>
                    <option value="any_pass">
                      มีผลผ่านที่ใช้สิทธิ์ได้ ตามแหล่งที่ยืนยัน
                    </option>
                    <option value="latest_assessed">
                      ใช้ผลประเมินล่าสุด ตามแหล่งที่ยืนยัน
                    </option>
                  </select>
                </label>
                <label className={styles.field}>
                  ขั้นต่ำทั่วไปภาคปกติ (ว่าง = ยังไม่ยืนยัน)
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={dataset.policy.normalMin ?? ""}
                    disabled={!editable}
                    onChange={(e) =>
                      modify((d) => ({
                        ...d,
                        policy: {
                          ...d.policy,
                          normalMin:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        },
                      }))
                    }
                  />
                </label>
                <label className={styles.field}>
                  เพดานหน่วยกิตภาคปกติ
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={dataset.policy.normalMax}
                    disabled={!editable}
                    onChange={(e) =>
                      modify((d) => ({
                        ...d,
                        policy: {
                          ...d.policy,
                          normalMax: Number(e.target.value),
                        },
                      }))
                    }
                  />
                </label>
                <label className={styles.field}>
                  เพดานฤดูร้อน
                  <input
                    type="number"
                    min="1"
                    max="15"
                    value={dataset.policy.summerMax}
                    disabled={!editable}
                    onChange={(e) =>
                      modify((d) => ({
                        ...d,
                        policy: {
                          ...d.policy,
                          summerMax: Number(e.target.value),
                        },
                      }))
                    }
                  />
                </label>
                <label className={styles.field}>
                  ที่มาของเกณฑ์คำนวณ
                  <input
                    value={dataset.policy.source}
                    disabled={!editable}
                    onChange={(e) =>
                      modify((d) => ({
                        ...d,
                        policy: { ...d.policy, source: e.target.value },
                      }))
                    }
                  />
                </label>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>หมวด</th>
                      <th>สาย</th>
                      <th>ขั้นต่ำ</th>
                      <th>แหล่งกฎ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataset.groups.map((g, index) => (
                      <tr key={index}>
                        <td>{CATEGORY_NAMES[g.category]}</td>
                        <td>
                          {g.track === "both"
                            ? "ทั้งสอง"
                            : TRACK_NAMES[g.track]}
                        </td>
                        <td>
                          <input
                            type="number"
                            aria-label={`ขั้นต่ำหมวด ${index + 1}`}
                            min="0"
                            value={g.minimum}
                            disabled={!editable}
                            onChange={(e) =>
                              modify((d) => ({
                                ...d,
                                groups: d.groups.map((item, i) =>
                                  i === index
                                    ? {
                                        ...item,
                                        minimum: Number(e.target.value),
                                      }
                                    : item,
                                ),
                              }))
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`แหล่งหมวด ${index + 1}`}
                            value={g.source}
                            disabled={!editable}
                            onChange={(e) =>
                              modify((d) => ({
                                ...d,
                                groups: d.groups.map((item, i) =>
                                  i === index
                                    ? { ...item, source: e.target.value }
                                    : item,
                                ),
                              }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label className={styles.field}>
                ประเด็นที่ยังไม่ยืนยัน หนึ่งประเด็นต่อบรรทัด
                <textarea
                  value={dataset.unresolved.join("\n")}
                  disabled={!editable}
                  onChange={(e) =>
                    modify((d) => ({
                      ...d,
                      unresolved: e.target.value
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }))
                  }
                />
              </label>
              <p className={styles.muted}>
                ลบประเด็นได้เมื่อบันทึกแหล่งยืนยันในข้อมูลและนโยบายที่เกี่ยวข้องแล้วเท่านั้น
              </p>
            </section>
          )}
          {tab === 2 && (
            <section className={styles.card}>
              <h2>ตารางเปิดสอนรายปีและรายภาค</h2>
              <p className={styles.note}>วิชาเลือกอาจเปิดไม่ตรงกันแต่ละภาค ให้ผู้ดูแลตรวจประกาศผู้สอน เช่น กลุ่ม Facebook ก่อนลงทะเบียน Reg แล้วบันทึกเฉพาะปีและภาคที่ประกาศ พร้อมผู้ประกาศ วันที่ และลิงก์หรือข้อความอ้างอิง การเปิดครั้งก่อนไม่ยืนยันว่าจะเปิดซ้ำ</p>
              <div className={styles.form}>
                <label className={styles.field}>
                  ปี พ.ศ.
                  <input
                    type="number"
                    min="2500"
                    max="2700"
                    value={year}
                    disabled={recurring || Boolean(busy)}
                    onChange={(e) => setYear(Number(e.target.value))}
                  />
                </label>
                <label className={styles.field}>
                  แหล่งข้อมูลหรือสมมติฐาน
                  <input
                    value={offeringSource}
                    disabled={!editable}
                    onChange={(e) => setOfferingSource(e.target.value)}
                  />
                </label>
              </div>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={recurring}
                  onChange={(e) => setRecurring(e.target.checked)}
                />
                แก้รูปแบบคาดเปิดซ้ำ (เป็น planned เสมอ)
              </label>
              <p className={styles.note}>
                ข้อมูลเฉพาะปี/ภาคมาก่อนรูปแบบซ้ำ รวมถึงเมื่อระบุว่ายังไม่ทราบ
                ไม่เติมว่าเปิดสอนจากช่องที่ว่าง
              </p>
              <label className={styles.field}>
                ค้นหารายวิชาในตาราง
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>รายวิชา</th>
                      <th>ภาคต้น</th>
                      <th>ภาคปลาย</th>
                      <th>ฤดูร้อน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataset.courses
                      .filter((c) => `${c.code} ${c.name}`.includes(search))
                      .map((c) => (
                        <tr key={c.code}>
                          <td>
                            {c.code} · {c.name}
                          </td>
                          {([1, 2, 3] as const).map((semester) => {
                            const offering = dataset.offerings.find(
                              (o) =>
                                o.courseCode === c.code &&
                                o.year === (recurring ? 0 : year) &&
                                o.semester === semester,
                            );
                            return (
                              <td key={semester}>
                                <select
                                  aria-label={`เปิดสอน ${c.code} ภาค ${semester}`}
                                  value={offering?.availability ?? "unknown"}
                                  disabled={!editable}
                                  onChange={(e) =>
                                    setOffering(
                                      c.code,
                                      semester,
                                      e.target.value as
                                        | "open"
                                        | "closed"
                                        | "unknown",
                                    )
                                  }
                                >
                                  <option value="unknown">ยังไม่ทราบ</option>
                                  <option value="open">เปิด</option>
                                  <option value="closed">ไม่เปิด</option>
                                </select>
                                {offering && (
                                  <>
                                    <button type="button" className={styles.secondary} disabled={!editable} aria-label={`ลบการเปิดสอน ${c.code} ปี ${offering.year} ภาค ${semester}`} onClick={() => {
                                      if (!window.confirm(`ลบรายการเปิดสอน ${c.code} ปี ${offering.year || "คาดเปิดซ้ำ"} ภาค ${semester} จากร่าง? การลบไม่ใช่การระบุว่าไม่เปิดสอน ระบบจะพิจารณาข้อมูลที่เหลือ ต้องบันทึกร่างจึงมีผล`)) return;
                                      modify(d => ({ ...d, offerings: d.offerings.filter(o => !(o.courseCode === c.code && o.year === offering.year && o.semester === semester)) }));
                                      setSuccess("ลบรายการเปิดสอนจากร่างแล้ว ยังไม่บันทึก");
                                    }}>ลบรายการนี้จากร่าง</button>
                                    <span className={styles.muted}>
                                      {offering.confidence === "confirmed"
                                        ? "ยืนยันจากแหล่ง"
                                        : "คาดการณ์"}
                                    </span>
                                    <label className={styles.field}>
                                      ที่มา {c.code} ภาค {semester}
                                      <input value={offering.source} maxLength={500} disabled={!editable}
                                        onChange={(e) => modify((d) => ({ ...d, offerings: d.offerings.map((o) =>
                                          o.courseCode === c.code && o.year === (recurring ? 0 : year) && o.semester === semester
                                            ? { ...o, source: e.target.value, confidence: "planned" } : o) }))} />
                                    </label>
                                    {!recurring && (
                                      <label className={styles.check}>
                                        <input
                                          type="checkbox"
                                          checked={
                                            offering.confidence === "confirmed"
                                          }
                                          disabled={!editable}
                                          onChange={(e) =>
                                            modify((d) => ({
                                              ...d,
                                              offerings: d.offerings.map((o) =>
                                                o.courseCode === c.code &&
                                                o.year === year &&
                                                o.semester === semester
                                                  ? {
                                                      ...o,
                                                      confidence: e.target
                                                        .checked
                                                        ? "confirmed"
                                                        : "planned",
                                                    }
                                                  : o,
                                              ),
                                            }))
                                          }
                                        />
                                        มีแหล่งยืนยัน
                                      </label>
                                    )}
                                  </>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {tab === 3 && (
            <section className={styles.card}>
              <h2>นำเข้ารายวิชาแบบตรวจตัวอย่างก่อนบันทึก</h2>
              <p>
                ดาวน์โหลดแม่แบบ กรอกข้อมูลใน Excel แล้วอัปโหลด
                ระบบแสดงข้อผิดพลาดรายแถวก่อนนำข้อมูลเข้าสู่ร่าง
              </p>
              <div className={styles.actions}>
                <a href="/api/admin/academic/template?format=xlsx" download>
                  แม่แบบ Excel
                </a>
                <a href="/api/admin/academic/template" download>แม่แบบ CSV</a>
                <button className={styles.secondary} onClick={exportCourses}>
                  ส่งออกรายวิชาชุดนี้เป็น CSV
                </button>
              </div>
              <details className={styles.detail}>
                <summary>ค่าที่ใช้ในแม่แบบ</summary>
                <p>
                  หมวด:{" "}
                  {Object.entries(CATEGORY_NAMES)
                    .map(([id, name]) => `${id} = ${name}`)
                    .join("; ")}
                </p>
                <p>
                  grading ใช้ numeric / su / unknown; tracks ใช้ project หรือ
                  cooperative หรือเว้นว่างเมื่อทั้งสอง; รหัสวิชาก่อนคั่นด้วย ;
                  และโหมด all / any; ค่าจริง/เท็จใช้ true / false; ไม่ใช้สูตร
                  Excel
                </p>
              </details>
              <form onSubmit={importFile}>
                <label className={styles.field}>
                  ไฟล์รายวิชา CSV UTF-8 หรือ Excel
                  <input
                    type="file"
                    name="file"
                    accept=".csv,.xlsx"
                    required
                    disabled={!editable}
                    onChange={() => setPreview(null)}
                  />
                </label>
                <button className={styles.secondary} disabled={!editable}>
                  ตรวจตัวอย่างไฟล์
                </button>
              </form>
              {preview && (
                <>
                  {!preview.valid && <p role="alert" className={styles.error}>ยังนำเข้าไฟล์นี้ไม่ได้ กรุณาแก้แถวที่แจ้งปัญหาใน Excel หรือไฟล์ CSV แล้วเลือกไฟล์ที่แก้แล้วมาตรวจอีกครั้ง</p>}
                  <p>
                    {preview.accepted}/{preview.total} แถวอ่านได้
                    ยังไม่ได้บันทึกหรือเผยแพร่
                  </p>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>แถว</th>
                          <th>รหัส / ชื่อ</th>
                          <th>ผลตรวจ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((r) => (
                          <tr key={r.row}>
                            <td>{r.row}</td>
                            <td>
                              {r.course
                                ? `${r.course.code} · ${r.course.name}`
                                : "—"}
                            </td>
                            <td>{r.error ?? "ตรวจรูปแบบผ่าน"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    className={styles.primary}
                    disabled={!editable || !preview.valid || !preview.total}
                    onClick={() => {
                      const courses = preview.rows.map((r) => r.course!);
                      modify((d) => ({
                        ...d,
                        courses: [
                          ...d.courses.filter(
                            (c) =>
                              !courses.some((next) => next.code === c.code),
                          ),
                          ...courses,
                        ],
                      }));
                      setSuccess(
                        "นำตัวอย่างเข้าร่างบนหน้าจอแล้ว ตรวจความสัมพันธ์และบันทึกร่างก่อนเผยแพร่",
                      );
                    }}
                  >
                    นำแถวที่ตรวจผ่านเข้าสู่ร่าง
                  </button>
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
