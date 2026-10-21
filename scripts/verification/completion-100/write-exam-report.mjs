import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const docs = path.resolve(root, "../aps-v2-doc/deliverables/completion-100");
const read = name => JSON.parse(readFileSync(path.join(docs, name), "utf8"));
const result = read("acceptance-results.json"), manual = read("exam-2026-10-21/manual-results.json"), accounts = read("exam-2026-10-21/account-preparation.json");
const checks = read("checks.json"), security = read("exam-2026-10-21/security-review.json");
const windowCheck = read("exam-2026-10-21/ux-repair/round-3/window-check.json");
const latest = key => checks.attempts.filter(c => c.key === key).at(-1);
const labels = { passed: "ผ่าน", failed: "ไม่ผ่าน", partial: "บางส่วน", not_run: "ยังไม่ตรวจ" };
const write = (name, content) => writeFileSync(path.join(docs, name), content.trim() + "\n");
const googleTable = manual.google.steps.map(s => `| ${s.id} | ${labels[s.status]} | ${s.method || "—"} | ${s.actual || "ยังไม่มีผลสังเกต"} |`).join("\n");
const trialTable = manual.trial.steps.map(s => `| ${s.id} | ${labels[s.status]} | ${s.method || "—"} | ${s.assistance || "ยังไม่ทราบ"} | ${s.actual || "ยังไม่มีผลสังเกต"} |`).join("\n");
const checkTable = ["quality", "integration", "auth", "public", "recovery", "completion", "rehearsal", "demo"].map(k => `| ${latest(k).command} | ${labels[latest(k).status]} | ${(latest(k).counts || []).join("; ")} | ${latest(k).end} |`).join("\n");
write("report.md", `# ผลเตรียม APS-v2 สำหรับสอบวันที่ 21 ตุลาคม 2569

ปรับตามแผนที่ผู้ใช้อนุมัติวันที่20: บัญชีGoogleจริงสองบัญชี ผู้ทดลองใหม่หนึ่งคนสองบทบาท และไม่บังคับhuman peer reviewก่อนสอบ

**สถานะตามขอบเขตสอบ: ${result.finalReady ? "ผ่านเกณฑ์ที่ตกลงแล้ว" : "ยังมีงานตรวจรับค้าง"}** เกณฑ์โครงงานเพิ่มเติมผ่าน ${result.summary.passed}/${result.summary.total}; Googleจริง ${labels[result.releaseGates.realGoogleOnFinalVersion]}; ผู้ทดลอง ${labels[result.releaseGates.newRealUsers]} ผลล่าสุดตรวจจาก [acceptance-results.json](acceptance-results.json) และ [ผลสังเกตรายขั้น](exam-2026-10-21/manual-results.json)

## บัญชีและGoogleจริง

เพิ่มบัญชีนักศึกษาทดลองแบบactiveโดยยังไม่สร้างenrollment/ประวัติเรียน และเพิ่มผู้ดูแลเฉพาะCS2565หลังผู้ใช้ยืนยันอนุญาตโดยตรง ไม่ให้สิทธิ์จัดการบัญชี ไม่เปลี่ยนผู้ดูแลเดิม การเพิ่มทำผ่านaccount serviceเดิม ไม่สร้างGoogle identity/sessionปลอม ผลบัญชีอื่นไม่เปลี่ยน: ${accounts.otherAccountStateUnchanged}

Googleเคยตรวจผ่านproduction buildปกติบนlocalhost:3000 และlocal aps_v2_dev คุณเป็นผู้เลือกบัญชี/ยืนยันGoogleเอง ผลในตารางเก็บตามเวลาที่สังเกต ไม่ใช่การรับรองรุ่นล่าสุด: สถานะรวมรุ่นปัจจุบัน ${labels[result.releaseGates.realGoogleOnFinalVersion]} ต้องตรวจซ้ำเมื่อโค้ดเปลี่ยน ไม่บันทึกข้อมูลเข้าสู่ระบบหรือผลAPIดิบ ดู [บัญชีแบบไม่ระบุตัวตน](exam-2026-10-21/account-preparation.json)

| กรณี | ผล | วิธี | สิ่งที่เกิดจริง |
|---|---|---|---|
${googleTable}

ขอบเขตBack/refreshเป็นเส้นทางที่บันทึกจริงในตาราง ไม่อ้างว่าตรวจทุกhistory pathหรือทุกbrowser การสมัครอัตโนมัติด้วยอีเมลมหาวิทยาลัยยังไม่ตรวจด้วยบัญชีมหาวิทยาลัยใหม่

## ผู้ทดลองใหม่หนึ่งคนสองบทบาท

ใช้ชุดสังเคราะห์ในlocal aps_v2_test แยกจากGoogleจริง ไม่ใช้รหัสผ่านของคุณ ผู้ทดลองไม่ถูกนับเป็นสองคน จำนวนผู้ทดลองที่บันทึกแล้ว: ${manual.trial.participantCount} คน วิธีuser_reportหมายถึงคุณรายงานผลสังเกต ไม่ใช่AIเห็นทุกขั้นเอง ไม่ใช่การศึกษาผู้ใช้ในวงกว้าง

| งาน | ผล | วิธี | ความช่วยเหลือ | ผลจริง |
|---|---|---|---|---|
${trialTable}

## ผลพัฒนาและการตรวจอัตโนมัติ

งานruntimeจากรอบก่อน: policy snapshot/ที่มาบนผลนักศึกษา, สถานภาพทางการยังไม่ยืนยัน, เตือนตรวจเกณฑ์ใหม่ และfinite GPA validation รอบรับfeedbackแก้ตัวอ่านชื่อPDF ทางเริ่มงานและสี จากนั้นแก้หน้าเริ่มต้นตามบทบาท เพิ่มหน้าดูผลการเรียนที่ยืนยันแล้ว เอากรอบเลื่อนแนวตั้งซ้อนออก และปรับคำงานหลัก ดู [รอบล่าสุดและข้อที่ยังไม่ผ่าน](exam-2026-10-21/ux-repair/round-3/report.md) และ [ประวัติรอบก่อน](exam-2026-10-21/ux-repair/report.md) ไม่มีAPI endpointหรือschemaใหม่ ไม่แก้ข้อมูลCS2565ที่ยังไม่ยืนยันเป็นข้อเท็จจริง

| คำสั่ง | ผล | จำนวนตามlog | เวลารัน UTC |
|---|---|---|---|
${checkTable}

หน้าต่างเดโมจริง: ${labels[windowCheck.status]} เวลา ${windowCheck.checkedAt}; ${windowCheck.windows.map(w => `${w.role} ${w.width}×${w.height} ภายในจอ ${w.availableWidth}×${w.availableHeight}`).join("; ")} ตรวจข้อมูลก่อน/หลังไม่เปลี่ยน ดู [ผลตรวจหน้าต่าง](exam-2026-10-21/ux-repair/round-3/window-check.json) การตรวจนี้เป็น Chromium เดโมสังเคราะห์ ไม่ใช่ผลผู้ทดลองหรือ Google

ผลข้างต้นเป็นlocal checks ตามเวลาแต่ละรายการ ไม่เรียกว่าCI ดูchecks.jsonสำหรับlog hashและประวัติที่ไม่ผ่าน กรณีของรุ่นก่อนยังเป็นประวัติ เมื่อแก้runtimeต้องรันchecksที่เกี่ยวข้องใหม่ก่อนอ้างถึงรุ่นล่าสุด เครื่องมือเกณฑ์สอบตรวจด้วยnode --test exam-readiness.test.mjs (5ผ่าน) การทดสอบนี้ใช้หลักฐานสมมติทดสอบตัวบันทึก ไม่ใช่สร้างผลผู้ใช้จริง

## Security และpeer review

production dependency scan ${security.production.total}รายการ; รวมdev ${security.findings.total}รายการระดับhighจากadvisoryเดียว ตรวจและบันทึกโดยagent self-reviewตามsecurity-review.json ปัญหายังไม่ถูกแก้ ไม่ถือว่าเป็นfull security assessmentหรือhuman peer review ไม่ลดรุ่นชุดlintหรือใช้audit fix --forceก่อนสอบ

**Human peer review: ไม่ได้ดำเนินการ และไม่เป็นเงื่อนไขบังคับก่อนสอบตามแผนใหม่** การให้คนทดลองเดโมเป็นuser acceptance ไม่ใช้แทนการตรวจโค้ด

## ข้อจำกัดที่ต้องบอกก่อนสาธิต

- ฐานจริงมีร่างหลักสูตร2ฉบับและยังไม่มีฉบับเผยแพร่ ณ ตรวจหน้าadmin จึงยังไม่วิเคราะห์แผนวิชาการด้วยบัญชีGoogleจริงได้ ชุดเดโมมีข้อมูลสังเคราะห์แยกไว้ ไม่เผยแพร่ข้อมูลจริงให้อัตโนมัติ
- นโยบาย/เกณฑ์สาธิตไม่ใช่การรับรองกฎมหาวิทยาลัย การอนุมัติลงทะเบียนหรือการจบ การไม่มีข้อมูลยังต้องแสดงข้อจำกัด
- คะแนนเดิม89.82%และเกณฑ์เดิมเก็บแยกพร้อมhash ไม่เปลี่ยนชื่อเป็น100%ตามเกณฑ์ใหม่ ประวัติก่อนเปลี่ยนเงื่อนไขสอบอยู่ในexam-2026-10-21/history
- ไม่มีcommit/push/merge/deploy ภาพสำรอง16ภาพเป็นข้อมูลสังเคราะห์จากการรันอัตโนมัติเดิม ไม่ใช่ภาพผู้ทดลองคนใหม่หรือGoogleจริง

[เปิดชุดทดลองและวิธีตรวจซ้ำ](README.md) · [ภาพสำรองออฟไลน์](backup.html) · [เกณฑ์ฉบับสอบ](exam-2026-10-21/plan.md)
`);
write("manual-release-checks.md", `# ผลตรวจGoogleจริงและข้อจำกัดก่อนสอบ

เกณฑ์สอบฉบับ exam-2026-10-21-v1 ใช้บัญชีGoogleจริงสองบัญชีที่ผู้ใช้ระบุ ไม่ต้องใช้บัญชีมหาวิทยาลัยของคนอื่น รักษาบัญชีเดิม ผู้ดูแลใหม่มีสิทธิ์เฉพาะCS2565และไม่มีสิทธิ์จัดบัญชี รายชื่อจริงเก็บในระบบ ไม่ใส่อีเมลหรือข้อมูลเข้าสู่ระบบในรายงาน

ผลจริงใช้production buildบนlocalhost:3000 ไม่ใช่signed fixturesของพอร์ต3101/3102 ตารางเก็บประวัติรายขั้น สถานะรุ่นปัจจุบัน ${labels[result.releaseGates.realGoogleOnFinalVersion]} ผลเก่าที่ผ่านยังต้องตรวจซ้ำกับโค้ดรุ่นสุดท้าย

| กรณี | ผล | วิธี | ผลสังเกต |
|---|---|---|---|
${googleTable}

ผลนี้ไม่แทนการตรวจมหาวิทยาลัยสมัครอัตโนมัติหรือทุกhistory path ฐานจริงยังไม่มีชุดวิชาการเผยแพร่ จึงแยกการตรวจGoogleออกจากการทดลองflowวิชาการในฐานสาธิต

## Human peer review

สถานะ: **ไม่ได้ดำเนินการ ไม่บังคับก่อนสอบ** ตามผู้ใช้อนุมัติแผนใหม่ การตรวจdiff/วิเคราะห์dev findingsโดยagentเป็นself-reviewเท่านั้น ไม่เรียกว่าpeer review ผลdependency scanและข้อจำกัดอยู่ในexam-2026-10-21/security-review.json

หากมีผู้ตรวจโค้ดภายหลัง ให้บันทึกalias รุ่น วันเวลา findingsและผลแก้จริงแยก ห้ามเปลี่ยนผลself-reviewเดิมเป็นhuman review ไม่มีCI/deployในขอบเขตนี้
`);
write("user-trial.md", `# ผู้ทดลองใหม่หนึ่งคน สองบทบาท

เกณฑ์สอบที่ผู้ใช้อนุมัติ: ผู้ทดลองใหม่จริง1คนทำงานนักศึกษาและผู้ดูแล บันทึกว่า1คน2บทบาท ไม่ต้องใช้Googleของผู้ทดลองและไม่ให้รหัสผ่านGoogleของเจ้าของระบบ ผลปัจจุบัน: ${labels[result.releaseGates.newRealUsers]}

ผู้จัดเตรียมเปิดชุดสังเคราะห์แยกในaps_v2_testให้ก่อน ผู้ทดลองทำเองจากโจทย์และคำแนะนำบนเว็บ ไม่ชี้ปุ่มหรือทำแทน หากต้องช่วยให้บันทึกตามจริง ทดสอบขั้นที่กระทบซ้ำหลังแก้ และระบุว่าครั้งแรกหรือหลังได้รับคำแนะนำ ไม่สมมติว่ามีผู้ทดลองคนใหม่เพิ่ม

โจทย์นักศึกษา: นำเข้าPDFของรอบนั้น→ตรวจทาน/ยืนยัน→อ่านความก้าวหน้าและข้อจำกัด→เปรียบเทียบสองสาย→ลองWhat-if→กลับผลฐาน ประวัติจริงต้องไม่เปลี่ยนจากการจำลอง

โจทย์ผู้ดูแล: นำเข้าadministrator-with-error.csv→ระบุแถวผิด→ใช้administrator-valid.csv/แก้ร่าง→แก้เปิดสอน→ตรวจทานก่อนเผยแพร่เฉพาะชุดสาธิต ฉบับเดิมยังต้องอ่านได้

| งาน | ผล | วิธี | ความช่วยเหลือ | ผลจริง |
|---|---|---|---|---|
${trialTable}

ข้อมูลผู้ทดลองใช้aliasเท่านั้น จำนวนที่บันทึก: ${manual.trial.participantCount} ผลuser_reportเป็นคำรายงานจากผู้สังเกต ไม่ใช่การสังเกตโดยAIทุกขั้น หากมีการช่วยจะไม่ถูกนับว่าเป็นการทำสำเร็จเองในเครื่องมือสรุป

ผลที่มีวันเวลาและประวัติแก้อยู่ในexam-2026-10-21/manual-results.jsonและobservation-history แบบเริ่มต้นมีnot_run ไม่กรอกpassedอัตโนมัติ ดูREADMEสำหรับเปิดชุดและคำสั่งบันทึก
`);
write("README.md", `# ชุดเตรียมสอบ APS-v2 — 21 ตุลาคม 2569

[รายงานผลจริง](report.md) · [เกณฑ์สอบ](exam-2026-10-21/plan.md) · [ผลรายขั้น](exam-2026-10-21/manual-results.json) · [ภาพสำรอง](backup.html)

สถานะGoogleจริง: ${labels[result.releaseGates.realGoogleOnFinalVersion]} · ผู้ทดลองใหม่1คน2บทบาท: ${labels[result.releaseGates.newRealUsers]} · human peer reviewไม่ได้ทำและไม่บังคับก่อนสอบ · เกณฑ์เดิม89.82%เก็บแยก

## เปิดชุดสาธิต

จากPowerShell:

\`\`\`powershell
Set-Location C:\\Users\\MyLuna\\aps-v2
$trial = Get-Content -LiteralPath C:\\Users\\MyLuna\\aps-v2-doc\\deliverables\\completion-100\\user-trial-ready.json -Raw | ConvertFrom-Json
Write-Output $trial.inputPdf
npm.cmd run demo:open -- --run $trial.run --case not-selected,admin
\`\`\`

ใช้PDFของชื่อรอบเดียวกันและCSVในโฟลเดอร์นี้ ต้องเห็นป้ายข้อมูลสาธิต หน้าต่างนักศึกษา/ผู้ดูแลแยกcontext ไม่ใช้Google profileจริงและใช้local aps_v2_test ปิดหน้าต่างเดโมทั้งหมดเพื่อหยุดserverพอร์ต3102

ถ้าชุดเดิมผ่านการทดลองหรือเปลี่ยนข้อมูลแล้ว ให้เตรียมชื่อรอบใหม่ ไม่resetข้อมูลเก่า:

\`\`\`powershell
node --conditions=react-server --import tsx scripts/verification/completion-100/prepare-user-trial.ts
\`\`\`

## บันทึกผลและตรวจสรุป

record-exam.mjsใช้บันทึกเฉพาะสิ่งที่สังเกตหรือผู้ใช้รายงานจริง กำหนดmethodเป็นdirect_browser_observationหรือuser_report ระบุactualโดยไม่ใส่ชื่อจริง/อีเมล/URL/ข้อมูลเข้าสู่ระบบ สำหรับtrialต้องระบุparticipant alias, first-time yes/no และassistanceตามจริง ไม่ใช้เครื่องมือสร้างผลทดลองขึ้นเอง

\`\`\`powershell
node scripts/verification/completion-100/summarize.mjs
node scripts/verification/completion-100/write-exam-report.mjs
node scripts/verification/completion-100/verify-delivery.mjs
node --test scripts/verification/completion-100/exam-readiness.test.mjs
\`\`\`

ตัวสรุปอ่านหลักฐานจริงที่บันทึกไว้ ไม่resetเป็นnot_runทุกครั้ง และไม่ผ่านจากการเตรียมชุด/fixtures หลักฐานต้องอ้างsource snapshotตรงกัน การช่วยผู้ทดลองต้องรายงานเป็นpartialจนตรวจปิดตามเกณฑ์

ภาพสำรอง16ภาพโหลดออฟไลน์และใช้keyboard anchorได้ตามbackup-check.json เป็นภาพสังเคราะห์เดิม ไม่ใช่ภาพผู้ทดลองหรือGoogleจริง ไม่ส่งออก.env, sessions, cookies, private logsหรือrawtrace
`);
console.log("Exam documents updated from recorded observations; original reports retained in exam history");
