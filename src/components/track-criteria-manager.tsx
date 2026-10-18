"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { listCriteria, criteriaHistory, cohortRecord } from "@/server/track-criteria";
import { completeness } from "@/modules/track-criteria/validation";
import { CONDITION_NAMES, emptyCriteriaData, type CriteriaInput, type CriteriaView, type CriteriaData, type ConditionState } from "@/modules/track-criteria/types";
import { TRACK_NAMES } from "@/modules/curriculum/types";
import styles from "./academic-ui.module.css";
type State = Awaited<ReturnType<typeof listCriteria>>;
const stateNames = { unknown: "ยังไม่ทราบ", specified: "มีเงื่อนไขตามประกาศ", not_required: "ประกาศระบุว่าไม่กำหนดเงื่อนไขนี้" };
const statusNames = { draft: "ร่าง", published: "เผยแพร่", withdrawn: "ยกเลิกใช้" };
async function api<T>(body?: unknown, query = ""): Promise<T> {
  const r = await fetch(`/api/admin/track-criteria${query}`, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const result = await r.json(); if (!r.ok) throw new Error(result.error?.message || "ทำรายการไม่สำเร็จ"); return result;
}
function Summary({ c }: { c: CriteriaInput }) {
  const d = c.data;
  return <div><p>{TRACK_NAMES[c.track]} · รุ่น {c.admissionYears.join(", ") || "ยังไม่ระบุ"} · รอบ {c.year}/{c.semester}</p>
    <p>ช่วงใช้ {d.effectiveFrom || "—"} ถึง {d.effectiveUntil || "—"} · วิชาที่พิจารณา {d.targetCourseCodes.join(", ") || "ยังไม่ระบุ"}</p>
    <ul>{(Object.keys(CONDITION_NAMES) as (keyof typeof CONDITION_NAMES)[]).map(k => <li key={k}>{CONDITION_NAMES[k]}: {stateNames[d[k].state]} · อ้างอิง {d[k].evidence || "ยังไม่ระบุ"}</li>)}</ul>
    {d.gpax.state === "specified" && <p>GPAX ขั้นต่ำ {d.gpax.minimum ?? "—"} ใช้ผลถึง {d.gpax.throughYear ?? "—"}/{d.gpax.throughSemester ?? "—"} เทียบค่าก่อนปัด</p>}
    {d.courses.state === "specified" && <p>ชุดรายวิชา {d.courses.codes.join(", ")} · {d.courses.fulfillment === "passed" ? "ต้องผ่านแล้ว" : "นับผ่านแล้วหรือกำลังเรียนได้"}</p>}
    {d.exceptions.state === "specified" && <p>อนุโลม {d.exceptions.allowedOutstanding ?? "—"} วิชา · ห้ามขาด {d.exceptions.cannotBeOutstanding.join(", ") || "ไม่ได้ระบุ"} · {d.exceptions.approvalRequired ? `ต้องอนุมัติจาก ${d.exceptions.authority}` : "ตามประกาศไม่ต้องขออนุมัติข้อยกเว้น"}</p>}
    {d.manual.state === "specified" && <p>ตรวจโดย {d.manual.responsibleUnit}: {d.manual.description}</p>}
    <p>หลักฐาน: {d.source.title || "ยังไม่มี"} · {d.source.unit} · {d.source.date} · {d.source.locator}</p><p>{d.source.verification}</p>
    {d.source.url && <a href={d.source.url} target="_blank" rel="noopener noreferrer">เปิดแหล่งประกาศ</a>}
  </div>;
}
function CourseChoices({label,values,onChange,options,locked}: {label:string;values:string[];onChange:(codes:string[])=>void;options:{code:string;name:string}[];locked:boolean}) {
  const [search,setSearch] = useState("");
  const filtered = options.filter(c => `${c.code} ${c.name}`.toLowerCase().includes(search.toLowerCase()));
  return <fieldset><legend>{label}</legend><label className={styles.field}>ค้นหา {label}<input value={search} onChange={e=>setSearch(e.target.value)} /></label><p>เลือกแล้ว {values.length} วิชา: {values.join(", ") || "ยังไม่เลือก"}</p>{!options.length && <p>เลือกทะเบียนหลักสูตรก่อน</p>}<div style={{maxHeight:260,overflow:"auto"}}>{filtered.map(c => <label className={styles.check} key={c.code}><input type="checkbox" disabled={locked} checked={values.includes(c.code)} onChange={e=>onChange(e.target.checked?[...values,c.code]:values.filter(v=>v!==c.code))} />{c.code} {c.name}</label>)}</div></fieldset>;
}
export function TrackCriteriaManager({ initial }: { initial: State }) {
  const [yearsText, setYearsText] = useState("");
  const [state, setState] = useState(initial), [selected, setSelected] = useState<CriteriaView | null>(null), [form, setForm] = useState<CriteriaInput | null>(null);
  const [page, setPage] = useState("list"), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState("");
  const [filter, setFilter] = useState({ version: "", cohort: "", term: "", track: "" }), [reason, setReason] = useState(""), [replacesId, setReplacesId] = useState("");
  const [history, setHistory] = useState<Awaited<ReturnType<typeof criteriaHistory>> | null>(null);
  const [studentCode, setStudentCode] = useState(""), [cohort, setCohort] = useState<Awaited<ReturnType<typeof cohortRecord>> | null>(null), [admissionYear, setAdmissionYear] = useState(""), [cohortSource, setCohortSource] = useState("");
  useEffect(() => { const handle = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); }; window.addEventListener("beforeunload", handle); return () => window.removeEventListener("beforeunload", handle); }, [dirty]);
  const catalogue = state.catalogues.find(c => c.id === form?.catalogueDatasetId), locked = Boolean(selected && selected.status !== "draft");
  function change(patch: Partial<CriteriaInput>) { setForm(f => f ? { ...f, ...patch } : f); setDirty(true); }
  function data(patch: Partial<CriteriaData>) { if (form) change({ data: { ...form.data, ...patch } }); }
  function field<K extends "gpax" | "courses" | "exceptions" | "manual" | "source">(key: K, patch: Partial<CriteriaData[K]>) { if (form) data({ [key]: { ...form.data[key], ...patch } }); }
  function open(c: CriteriaView | null) {
    if (dirty && !window.confirm("มีข้อมูลยังไม่บันทึก ต้องการออกจากร่างนี้หรือไม่?")) return;
    setYearsText(c?.admissionYears.join(",") ?? "");
    setSelected(c); setForm(c ? structuredClone(c) : { curriculumVersionId: state.versions[0]?.id ?? "", catalogueDatasetId: null, admissionYears: [], track: "project", year: 2569, semester: 1, data: emptyCriteriaData() }); setDirty(false); setReason(""); setReplacesId(""); setError(""); setPage("edit");
  }
  async function perform(work: () => Promise<void>) {
    if (busy) return; setBusy(true); setError(""); setSuccess("");
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ"); } finally { setBusy(false); }
  }
  async function save() {
    const result = await api<CriteriaView>({ action: selected ? "save" : "create", id: selected?.id, expectedEditVersion: selected?.editVersion, criteria: form, reason });
    setSelected(result); setForm(result); setDirty(false); setState(await api<State>()); setSuccess("บันทึกร่างแล้ว ยังไม่เผยแพร่ หากเปลี่ยนรุ่น/รอบ/สาย เงื่อนไขจะกลับเป็นยังไม่ทราบเพื่อยืนยันใหม่");
  }
  const issues = form ? completeness(form) : [];
  const filtered = state.items.filter(c => (!filter.version || c.curriculumVersionId === filter.version) && (!filter.cohort || c.admissionYears.includes(Number(filter.cohort))) && (!filter.term || `${c.year}/${c.semester}`.includes(filter.term)) && (!filter.track || c.track === filter.track));
  const checkboxes = (label: string, values: string[], onChange: (codes: string[]) => void, options = catalogue?.courses ?? []) => <CourseChoices label={label} values={values} onChange={onChange} options={options} locked={locked} />;
  return <div className={styles.workspace}>
    <section className={styles.card}><h1>เกณฑ์เลือกสาย</h1><p>ผู้ดูแลบันทึกตามประกาศภาควิชา การเผยแพร่เกณฑ์ไม่ใช่การอนุมัติรายบุคคล ไม่มีการกำหนด GPAX หรือข้อยกเว้นให้เอง</p><Link href="/admin/academic">กลับข้อมูลวิชาการ</Link>
      <div className={styles.actions}><button className={styles.secondary} onClick={() => { if (!dirty || window.confirm("ออกจากร่างที่ยังไม่บันทึกหรือไม่?")) { setDirty(false); setPage("list"); } }}>รายการเกณฑ์</button><button className={styles.secondary} disabled={!state.versions.length || busy} onClick={() => open(null)}>สร้างร่างเกณฑ์</button><button className={styles.secondary} disabled={busy} onClick={() => void perform(async () => { if (dirty && !window.confirm("โหลดใหม่และทิ้งการแก้ไขที่ยังไม่บันทึกหรือไม่?")) return; const latest = await api<State>(); setState(latest); if (selected) { const c = latest.items.find(c => c.id === selected.id); if (c) { setSelected(c); setForm(c); } } setDirty(false); setSuccess("โหลดข้อมูลล่าสุดแล้ว"); })}>โหลดข้อมูลล่าสุด</button></div>
      {busy && <p role="status">กำลังดำเนินการ…</p>}{error && <p role="alert" className={styles.error}>{error}</p>}{success && <p role="status" className={styles.note}>{success}</p>}
    </section>
    {page === "list" && <section className={styles.card}><h2>รายการตามหลักสูตร รุ่น และรอบ</h2><div className={styles.form}>
      <label className={styles.field}>หลักสูตร<select value={filter.version} onChange={e => setFilter({ ...filter, version: e.target.value })}><option value="">ทุกหลักสูตรที่มีสิทธิ์</option>{state.versions.map(v => <option key={v.id} value={v.id}>{v.code}</option>)}</select></label>
      <label className={styles.field}>ปีเข้าศึกษาที่กรอง<input value={filter.cohort} onChange={e => setFilter({ ...filter, cohort: e.target.value })} /></label><label className={styles.field}>รอบที่กรอง<input placeholder="ปี/ภาค" value={filter.term} onChange={e => setFilter({ ...filter, term: e.target.value })} /></label>
      <label className={styles.field}>สายที่กรอง<select value={filter.track} onChange={e => setFilter({ ...filter, track: e.target.value })}><option value="">ทุกสาย</option><option value="project">โครงงานวิจัย</option><option value="cooperative">สหกิจศึกษา</option></select></label>
      <button className={styles.secondary} onClick={() => setFilter({ version: "", cohort: "", term: "", track: "" })}>ล้างตัวกรอง</button></div>
      {!filtered.length ? <p>{state.items.length ? "ไม่พบเกณฑ์ตามตัวกรอง" : "ยังไม่มีเกณฑ์ เริ่มสร้างร่างและตรวจประกาศภาควิชา"}</p> : <div className={styles.tableWrap} tabIndex={0} aria-label="รายการเกณฑ์เลือกสาย"><table className={styles.table}><thead><tr><th>ขอบเขต</th><th>ฉบับ / สถานะ</th><th>หลักฐาน / ข้อมูลขาด</th><th>จัดการ</th></tr></thead><tbody>{filtered.map(c => <tr key={c.id}><td>{state.versions.find(v => v.id === c.curriculumVersionId)?.code}<br />{TRACK_NAMES[c.track]} · รุ่น {c.admissionYears.join(", ")} · {c.year}/{c.semester}</td><td>v{c.version} · {statusNames[c.status]}<br />{c.data.effectiveFrom || "—"} ถึง {c.data.effectiveUntil || "—"}</td><td>{c.data.source.title || "ยังไม่มีหลักฐาน"}<br />ข้อมูลขาด {c.issues.length} รายการ</td><td><button className={styles.secondary} onClick={() => open(c)}>เปิดฉบับ {c.version}</button><button className={styles.secondary} onClick={() => void perform(async () => { setHistory(await api(undefined, `?history=${c.id}`)); setPage("history"); })}>ประวัติฉบับ {c.version}</button></td></tr>)}</tbody></table></div>}
      <details><summary>ยืนยันปีที่เข้าศึกษาจากหลักฐาน</summary><p>ใช้สำหรับเลือกเกณฑ์ให้ตรงรุ่น ไม่เดาจากรหัสนักศึกษา และไม่เปลี่ยนสาย</p>
        <label className={styles.field}>หลักสูตรนักศึกษา<select value={filter.version} onChange={e => { setFilter({ ...filter, version: e.target.value }); setCohort(null); }}><option value="">เลือกหลักสูตร</option>{state.versions.map(v => <option key={v.id} value={v.id}>{v.code}</option>)}</select></label>
        <label className={styles.field}>รหัสนักศึกษาที่ตรวจ<input value={studentCode} onChange={e => { setStudentCode(e.target.value); setCohort(null); }} /></label>
        <button className={styles.secondary} disabled={!filter.version || !studentCode || busy} onClick={() => void perform(async () => { const r = await api<Awaited<ReturnType<typeof cohortRecord>>>(undefined, `?versionId=${filter.version}&studentCode=${encodeURIComponent(studentCode)}`); setCohort(r); setAdmissionYear(r.admissionYear?.toString() ?? ""); setCohortSource(r.source ?? ""); })}>ค้นหาข้อมูลรุ่น</button>
        {cohort && <><p>ปีเข้าศึกษาเดิม {cohort.admissionYear ?? "ยังไม่ยืนยัน"}</p><label className={styles.field}>ปีที่เข้าศึกษายืนยัน (พ.ศ.)<input type="number" min={2500} max={2700} value={admissionYear} onChange={e => setAdmissionYear(e.target.value)} /></label><label className={styles.field}>ที่มายืนยันปีเข้าศึกษา<textarea value={cohortSource} onChange={e => setCohortSource(e.target.value)} /></label><button className={styles.secondary} disabled={busy || !admissionYear || !cohortSource.trim()} onClick={() => void perform(async () => { setCohort(await api({ action: "cohort", curriculumVersionId: filter.version, studentCode, admissionYear: Number(admissionYear), source: cohortSource, expectedVersion: cohort.version })); setSuccess("ยืนยันปีเข้าศึกษาแล้ว ไม่เปลี่ยนสายหรืออนุมัติสิทธิ์"); })}>บันทึกปีเข้าศึกษา</button></>}
      </details>
    </section>}
    {form && (page === "edit" || page === "review") && <section className={styles.card}>
      <h2>{page === "review" ? "ตรวจทานก่อนเผยแพร่" : "รายละเอียดเกณฑ์"} {selected ? `ฉบับ ${selected.version} · ${statusNames[selected.status]}` : "ร่างใหม่"}</h2>
      {locked && <p className={styles.note}>ฉบับนี้อ่านอย่างเดียว ต้องคัดลอกเป็นร่างใหม่เพื่อแก้ไข</p>}
      {page === "edit" ? <>
        <fieldset disabled={locked || busy}><legend>ขอบเขต</legend><div className={styles.form}>
          <label className={styles.field}>ฉบับหลักสูตร<select disabled={Boolean(selected)} value={form.curriculumVersionId} onChange={e => change({ curriculumVersionId: e.target.value, catalogueDatasetId: null })}>{state.versions.map(v => <option key={v.id} value={v.id}>{v.code}</option>)}</select></label>
          <label className={styles.field}>ปีเข้าศึกษา คั่นด้วยจุลภาค<input value={yearsText} onChange={e => { setYearsText(e.target.value); change({ admissionYears: e.target.value.split(",").filter(x => x.trim()).map(Number) }); }} /></label>
          <label className={styles.field}>สาย<select value={form.track} onChange={e => change({ track: e.target.value as CriteriaInput["track"] })}><option value="project">โครงงานวิจัย</option><option value="cooperative">สหกิจศึกษา</option></select></label>
          <label className={styles.field}>ปีการศึกษาที่ลงทะเบียน (พ.ศ.)<input type="number" value={form.year} onChange={e => change({ year: Number(e.target.value) })} /></label>
          <label className={styles.field}>ภาคเรียนที่ลงทะเบียน<select value={form.semester} onChange={e => change({ semester: Number(e.target.value) })}>{[1, 2, 3].map(v => <option key={v} value={v}>{v === 3 ? "ฤดูร้อน" : v}</option>)}</select></label>
          <label className={styles.field}>ทะเบียนรายวิชาที่อ้างอิง<select value={form.catalogueDatasetId ?? ""} onChange={e => change({ catalogueDatasetId: e.target.value || null })}><option value="">ยังไม่เลือก</option>{state.catalogues.filter(c => c.curriculumVersionId === form.curriculumVersionId).map(c => <option key={c.id} value={c.id}>ฉบับ {c.version} · {c.status}</option>)}</select></label>
          <label className={styles.field}>วันที่เริ่มใช้<input type="date" value={form.data.effectiveFrom} onChange={e => data({ effectiveFrom: e.target.value })} /></label><label className={styles.field}>วันที่สิ้นสุดใช้<input type="date" value={form.data.effectiveUntil} onChange={e => data({ effectiveUntil: e.target.value })} /></label>
        </div>{checkboxes("วิชาที่เกณฑ์ใช้พิจารณาสิทธิ์", form.data.targetCourseCodes, codes => data({ targetCourseCodes: codes }))}</fieldset>
        <fieldset disabled={locked || busy}><legend>เงื่อนไขตามประกาศ</legend><p>เปลี่ยนรุ่น/รอบ/สายแล้วบันทึก ระบบจะล้างเงื่อนไขเป็นยังไม่ทราบ ต้องตรวจและบันทึกอีกครั้ง</p>
          {(Object.keys(CONDITION_NAMES) as (keyof typeof CONDITION_NAMES)[]).map(key => <div key={key}>
            <label className={styles.field}>{CONDITION_NAMES[key]}: สถานะ<select value={form.data[key].state} onChange={e => { const next = e.target.value as ConditionState; if (form.data[key].state === "specified" && next !== "specified" && !window.confirm("เปลี่ยนสถานะและล้างค่าของเงื่อนไขนี้หรือไม่?")) return; field(key, { state: next }); }}>
              {Object.entries(stateNames).map(([v, name]) => <option key={v} value={v}>{name}</option>)}</select></label>
            {form.data[key].state !== "unknown" && <label className={styles.field}>{CONDITION_NAMES[key]}: ข้อความอ้างอิงในประกาศ<textarea value={form.data[key].evidence} onChange={e => field(key, { evidence: e.target.value })} /></label>}
          </div>)}
          {form.data.gpax.state === "specified" && <div className={styles.form}><label className={styles.field}>GPAX ขั้นต่ำ<input type="number" min={0} max={4} step="0.01" value={form.data.gpax.minimum ?? ""} onChange={e => field("gpax", { minimum: e.target.value === "" ? null : Number(e.target.value) })} /></label><label className={styles.field}>ใช้ผลถึงปีการศึกษา<input type="number" value={form.data.gpax.throughYear ?? ""} onChange={e => field("gpax", { throughYear: e.target.value === "" ? null : Number(e.target.value) })} /></label><label className={styles.field}>ใช้ผลถึงภาค<select value={form.data.gpax.throughSemester ?? ""} onChange={e => field("gpax", { throughSemester: e.target.value === "" ? null : Number(e.target.value) })}><option value="">ยังไม่ระบุ</option>{[1, 2, 3].map(v => <option key={v} value={v}>{v}</option>)}</select></label></div>}
          {form.data.courses.state === "specified" && <><label className={styles.field}>การนับผลรายวิชา<select value={form.data.courses.fulfillment} onChange={e => field("courses", { fulfillment: e.target.value as CriteriaData["courses"]["fulfillment"] })}><option value="passed">ต้องผ่านแล้ว</option><option value="passed_or_in_progress">นับผ่านแล้วหรือกำลังเรียนได้</option></select></label>{checkboxes("ชุดรายวิชาที่ต้องผ่าน", form.data.courses.codes, codes => field("courses", { codes }))}</>}
          {form.data.exceptions.state === "specified" && <><label className={styles.field}>จำนวนวิชาที่อนุโลม<input type="number" min={0} value={form.data.exceptions.allowedOutstanding ?? ""} onChange={e => field("exceptions", { allowedOutstanding: e.target.value === "" ? null : Number(e.target.value) })} /></label>{checkboxes("วิชาที่ห้ามขาด", form.data.exceptions.cannotBeOutstanding, codes => field("exceptions", { cannotBeOutstanding: codes }), catalogue?.courses.filter(c => form.data.courses.codes.includes(c.code)))}<label className={styles.field}>การอนุมัติข้อยกเว้น<select value={form.data.exceptions.approvalRequired === null ? "" : String(form.data.exceptions.approvalRequired)} onChange={e => field("exceptions", { approvalRequired: e.target.value === "" ? null : e.target.value === "true" })}><option value="">ยังไม่ทราบ</option><option value="true">ต้องอนุมัติ</option><option value="false">ประกาศไม่กำหนดให้ขออนุมัติ</option></select></label><label className={styles.field}>หน่วยงานผู้อนุมัติ<textarea value={form.data.exceptions.authority} onChange={e => field("exceptions", { authority: e.target.value })} /></label></>}
          {form.data.manual.state === "specified" && <><label className={styles.field}>รายละเอียดที่ต้องตรวจด้วยคน<textarea value={form.data.manual.description} onChange={e => field("manual", { description: e.target.value })} /></label><label className={styles.field}>หน่วยงานตรวจเงื่อนไข<input value={form.data.manual.responsibleUnit} onChange={e => field("manual", { responsibleUnit: e.target.value })} /></label></>}
        </fieldset>
        <fieldset disabled={locked || busy}><legend>แหล่งอ้างอิง</legend><p>เก็บรายละเอียดเอกสารกระดาษได้ ไม่บังคับ URL ไม่มีการอัปโหลดหรือดึงเว็บอัตโนมัติ</p>{([ ["title", "ชื่อประกาศ"], ["unit", "หน่วยงานผู้ออก"], ["date", "วันที่ประกาศ"], ["url", "URL (ถ้ามี)"], ["locator", "หน้า/ข้อที่อ้างอิง"], ["verification", "วิธีตรวจหลักฐาน"] ] as const).map(([key, label]) => <label className={styles.field} key={key}>{label}<input type={key === "date" ? "date" : key === "url" ? "url" : "text"} value={form.data.source[key]} onChange={e => field("source", { [key]: e.target.value })} /></label>)}</fieldset>
      </> : <><Summary c={form} /><h3>ข้อมูลที่ยังขาด</h3>{issues.length ? <ul>{issues.map(x => <li key={x}>{x}</li>)}</ul> : <p>ข้อมูลครบตามโครงสร้าง ต้องตรวจความถูกต้องของหลักฐานก่อนเผยแพร่</p>}<h3>ความต่างจากฉบับต้นทาง</h3>{selected?.basedOnId && state.items.find(c => c.id === selected.basedOnId) ? <><p>ฉบับเดิม (อ่านอย่างเดียว)</p><Summary c={state.items.find(c => c.id === selected.basedOnId)!} /><p>ฉบับใหม่อยู่ด้านบน โปรดเทียบขอบเขต เงื่อนไข และหลักฐาน</p></> : <p>ยังไม่มีฉบับต้นทาง</p>}
        <label className={styles.field}>ฉบับเผยแพร่ที่ต้องการแทน (ถ้ามี)<select disabled={locked} value={replacesId} onChange={e => setReplacesId(e.target.value)}><option value="">ไม่แทนฉบับ</option>{state.items.filter(c => c.status === "published" && c.curriculumVersionId === form.curriculumVersionId).map(c => <option key={c.id} value={c.id}>ฉบับ {c.version} · {TRACK_NAMES[c.track]} · {c.year}/{c.semester} · รุ่น {c.admissionYears.join(",")}</option>)}</select></label>
      </>}
      <label className={styles.field}>เหตุผลการดำเนินการ<textarea value={reason} onChange={e => setReason(e.target.value)} /></label>
      <div className={styles.actions}>
        {!locked && <button className={styles.primary} disabled={busy || !reason.trim()} onClick={() => void perform(save)}>บันทึกร่างเกณฑ์</button>}
        <button className={styles.secondary} onClick={() => setPage(page === "review" ? "edit" : "review")}>{page === "review" ? "กลับฟอร์ม" : "ตรวจทานเกณฑ์"}</button>
        {selected && <button className={styles.secondary} disabled={busy || !reason.trim() || dirty} onClick={() => void perform(async () => { const c = await api<CriteriaView>({ action: "copy", id: selected.id, expectedEditVersion: selected.editVersion, reason }); setState(await api()); open(c); setSuccess("คัดลอกเป็นร่างแล้ว เปลี่ยนรุ่นหรือรอบต้องยืนยันเกณฑ์ใหม่"); })}>คัดลอกเป็นร่างใหม่</button>}
        {page === "review" && !locked && <button className={styles.primary} disabled={busy || dirty || !selected || issues.length > 0 || !reason.trim()} onClick={() => void perform(async () => { if (!window.confirm("ยืนยันเผยแพร่เกณฑ์ตามขอบเขตและหลักฐานที่ตรวจแล้ว? การเผยแพร่ไม่ใช่การอนุมัติรายบุคคล")) return; const c = await api<CriteriaView>({ action: "publish", id: selected!.id, expectedEditVersion: selected!.editVersion, reason, replacesId: replacesId || undefined, expectedReplacedEditVersion: state.items.find(c => c.id === replacesId)?.editVersion }); setState(await api()); setSelected(c); setForm(c); setSuccess("เผยแพร่เกณฑ์แล้ว ไม่ได้อนุมัติสิทธิ์รายบุคคล"); })}>เผยแพร่เกณฑ์</button>}
        {selected?.status === "published" && <button className={styles.secondary} disabled={busy || !reason.trim()} onClick={() => void perform(async () => { if (!window.confirm("ยกเลิกใช้เกณฑ์ฉบับนี้และเก็บประวัติไว้?")) return; const c = await api<CriteriaView>({ action: "withdraw", id: selected.id, expectedEditVersion: selected.editVersion, reason }); setState(await api()); setSelected(c); setForm(c); setSuccess("ยกเลิกใช้แล้ว ประวัติยังอยู่"); })}>ยกเลิกใช้เกณฑ์</button>}
      </div>{dirty && <p className={styles.note}>มีการแก้ไขที่ยังไม่บันทึก ต้องบันทึกและตรวจทานก่อนเผยแพร่</p>}
    </section>}
    {page === "history" && history && <section className={styles.card}><h2>ประวัติฉบับ {history.criteria.version}</h2><Summary c={history.criteria} />{history.events.map(event => <details key={event.id}><summary>{event.action} · {new Date(event.createdAt).toLocaleString("th-TH")} · ผู้ดำเนินการ {event.actorAccountId}</summary><p>เหตุผล: {event.reason}</p><Summary c={event.snapshot as unknown as CriteriaView} /></details>)}</section>}
  </div>;
}
