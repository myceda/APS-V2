# APS-v2 — แนวทางทำงานใน repository

## ขอบเขตและแหล่งอ้างอิง

- โค้ดอยู่ `C:\Users\MyLuna\aps-v2`; เอกสารอยู่ `C:\Users\MyLuna\aps-v2-doc`
- อ่าน `C:\Users\MyLuna\aps-v2-doc\deliverables\aps-v2-requirements-freeze.md` ก่อนทำฟีเจอร์ แล้วตรวจตาราง CS-R/CS-P/OPEN และแบบ UX ที่เกี่ยวข้อง
- สร้างใหม่ CS2565-first ทั้งโครงงานและสหกิจ ไม่ย้ายโค้ด APS-v1/aps มาอัตโนมัติ
- ทำทีละ feature พร้อม requirement, ขอบเขตไฟล์, Acceptance Criteria และวิธีตรวจ ไม่ขยายไปทำรอบถัดไปเอง
- เก็บแผนและสถานะในพื้นที่เอกสาร; source/config/tests/migration อยู่ repository นี้

## โครงสร้างและเทคโนโลยี

- Next.js App Router + React + TypeScript strict; ใช้ npm และ package-lock.json
- `src/app` เป็น UI และตัวรับคำขอ; `src/modules` แยกหน้าที่ธุรกิจ; `src/server` เป็น integration/ข้อมูลส่วนตัว
- engine เป็น TypeScript ที่ไม่พึ่ง React, Next.js, Prisma หรือเครือข่าย
- รอบ 1 ใช้ PostgreSQL + Prisma และ Better Auth + Google แล้ว; PDF.js/Transcript/engine ยังเป็นรอบถัดไป Google จริงต้องตรวจแยกจาก session fixtures
- ใช้ CSS Modules และ tokens ใน globals.css รองรับภาษาไทย responsive และ keyboard
- เพิ่ม dependencies เฉพาะส่วนที่จะใช้งานจริง ตรวจรุ่นและตรึง lockfile

## ข้อมูลและสิทธิ์

- ตรวจ identity/ownership/สิทธิ์หลักสูตรบน server ทุกคำขอ ห้ามเชื่อ student_id หรือ role จาก client
- PDF ไม่เปลี่ยนตัวตนบัญชี; transcript draft ไม่ใช่ confirmed revision
- เก็บเกรดดิบ ประวัติเรียนซ้ำ และแหล่งอ้างอิง ไม่เปลี่ยน unknown ให้ผ่าน/ไม่ผ่าน หรือเปิด/ไม่เปิดเอง
- ข้อมูลหลักมีฉบับ; จำลองใช้ engine เดียวกันและไม่เขียนกลับประวัติจริง
- ไม่เดากฎ OPEN ไม่รับรองการจบ/ลงทะเบียนจากส่วนที่ยังไม่ตรวจ
- ไม่เก็บ secrets, PDF ส่วนตัว, ชื่อหรือรหัสนักศึกษาใน Git/logs; `.env.example` มีแต่ placeholders
- ไม่ใส่การข้าม authentication ในเว็บเพื่อทำให้การทดสอบผ่าน

## การตรวจและส่งมอบ

- PowerShell ใช้ `npm.cmd`/`npx.cmd`; เริ่มจาก `git status --short` และรักษางานเดิม
- รัน `npm.cmd run check`; หลัง build รัน `npm.cmd run test:e2e` สำหรับ UI ที่เกี่ยวข้อง
- รอบ 1 มี unit tests และบังคับมี tests; รัน test:integration และ test:e2e:auth กับ aps_v2_test เท่านั้น ห้ามใช้ dev database หรือเพิ่ม auth bypass endpoint ในเว็บ
- browser smoke tests ตรวจ production build desktop/mobile โดยไม่ใช้ credentials; auth suite ใช้ signed database session fixtures และไม่แทนการตรวจ Google OAuth จริง
- ตรวจ diff ของไฟล์ใหม่ด้วย `git diff --no-index -- /dev/null <file>`; คำสั่งคืน 1 เมื่อพบ diff เป็นปกติ
- การ review เองไม่แทน peer review; รายงาน local checks แยกจาก CI
- ใช้ main เป็นฐานและ branch ของแต่ละ feature เมื่อมี initial commit; ห้าม commit/push/merge/deploy เว้นแต่ผู้ใช้สั่ง
- สรุปเป็นภาษาไทย แยกพัฒนาแล้ว ทดสอบแล้ว deploy แล้ว และยังต้องตรวจ

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
