# APS-v2

เว็บช่วยวางแผนการเรียนสำหรับ CS2565 ทั้งสายโครงงานวิจัยและสหกิจศึกษา สร้างใหม่ด้วย TypeScript, Next.js App Router และ React

**สถานะ 16 ตุลาคม 2569:** ปรับให้บัญชีใหม่อัปโหลดก่อนกรอกข้อมูลและยืนยันข้อมูลนักศึกษาจาก PDF ได้เอง แยกข้อมูลที่นักศึกษายืนยันจากข้อมูลที่ผู้ดูแลตรวจ ปรับ font/สี/ปุ่ม/ข้อความและรายการงานผู้ดูแลแล้ว ผลตรวจและข้อขวางเดโมจริงอยู่ใน `C:\Users\MyLuna\aps-v2-doc\deliverables\aps-v2-demo-rework-report.md` ยังไม่รับรอง Google จริงสองบัญชีหรือความพร้อม 100%

## เริ่มใช้งานบน Windows

ต้องมี Node.js 24.x และ npm (เครื่องที่ตรวจใช้ Node.js 24.13.1 / npm 11.8.0)

```powershell
Set-Location C:\Users\MyLuna\aps-v2
npm.cmd ci
npm.cmd run dev
```

เปิด `http://localhost:3000` หน้าเริ่มต้นไม่ต้องมี `.env`, PostgreSQL หรือ Google credentials เว็บผูกกับ loopback สำหรับเดโมบนเครื่อง การเข้าสู่ระบบใช้ localhost ให้ตรง callback Google หากเข้าจาก 127.0.0.1 หน้า sign-in จะส่งไป canonical localhost

## เตรียมฐานข้อมูลและผู้ดูแลหลัก

เครื่องปัจจุบันเตรียม PostgreSQL local, migration และผู้ดูแลหลักแล้ว `.env` เก็บค่าลับที่สร้างบนเครื่องและไม่เข้า Git ตรวจความพร้อมโดยไม่แสดงค่าลับได้ด้วย `npm.cmd run setup:check`

สำหรับเครื่องใหม่ ใช้ PostgreSQL 18 และกำหนด `PGADMINPASSWORD` เฉพาะ process จากการรับค่าลับบนเครื่อง จากนั้นรันตามลำดับ:

```powershell
npm.cmd run db:setup
npm.cmd run db:migrate
npm.cmd run db:bootstrap
npm.cmd run setup:check
```

db:setup สร้างบัญชีแอป aps_v2_app ที่ไม่เป็น superuser และฐาน aps_v2_dev/shadow/test พร้อมรหัสผ่านใหม่ใน .env ไม่แสดงค่า ไม่ล้างฐานเดิม และหยุดเมื่อเจ้าของ/schema เดิมไม่ตรง db:bootstrap รับอีเมลบนเครื่องและสร้างผู้ดูแลหลักเพียงคนเดียว คำสั่งรันซ้ำกับอีเมลเดิมไม่เปลี่ยนข้อมูล

ก่อนแก้ฐานที่มีข้อมูลให้สำรองด้วย pg_dump ไปพื้นที่ส่วนตัวที่ไม่เข้า Git แผนย้อนโค้ดคง schema/ข้อมูลไว้ ไม่ใช้ reset หรือ drop เพื่อแก้ failure

บนเครื่องนี้ใช้ `node scripts/backup-development-database.mjs` เพื่อสำรอง aps_v2_dev แบบ custom archive และตรวจ pg_restore --list ไฟล์อยู่ storage/backups ที่ไม่เข้า Git การตรวจ archive ยังไม่ใช่การทดลอง restore

บัญชีใหม่ที่อีเมลตรง @silpakorn.edu และ Google ยืนยัน email_verified/hd=silpakorn.edu สร้างสิทธิ์นักศึกษาและผูกตัวตนอัตโนมัติในธุรกรรมเดียว บัญชีนอกโดเมนยังใช้รายชื่ออนุญาต และบัญชีระงับไม่ถูกเปิดใหม่ หน้า /student ให้อัปโหลด PDF แล้วตรวจข้อมูลก่อนยืนยันครั้งเดียว การยืนยันสร้าง StudentEnrollment แบบ student_confirmed และฉบับผลการเรียนใน transaction เดียว ไม่รอผู้ดูแลทุกคน รหัสซ้ำจะคงร่างและส่งเข้ารายการตรวจ /admin/accounts โดยไม่ย้ายข้อมูลเดิม

ทุกหน้าบัญชีแสดงอีเมลที่ server ตรวจแล้วจาก AccountContext หน้า sign-in ให้กรอกอีเมลที่ต้องการเข้าใช้ ส่ง loginHint ให้ Google และเก็บอีเมลที่ร้องขอใน OAuth state ฝั่ง server ก่อนเข้า APS ต้องตรงกับอีเมลที่ Google ตรวจลายเซ็นแล้ว หากไม่ตรงจะแสดง GOOGLE_ACCOUNT_MISMATCH โดยไม่สร้าง session ของบัญชีที่ร้องขอ อีเมลที่พิมพ์ไม่ใช่หลักฐานยืนยันตัวตน เจ้าของบัญชีต้องเข้าสู่ Google ด้วยบัญชีของตน รวมรหัสผ่านและขั้นตอนยืนยันเมื่อ Google ขอ

เมื่อกด Google login ระบบออกจากบัญชี APS เดิมก่อน หาก logout ไม่สำเร็จจะไม่เริ่ม login ใหม่ หากยกเลิกหรือผิดบัญชีจะไม่กลับเข้าข้อมูลเดิม นักศึกษามหาวิทยาลัยใหม่ไม่ต้องให้ผู้ดูแลเพิ่มรายชื่อ; คำขอในหน้าผู้ดูแลใช้กรณีข้อมูลขัดแย้งหรือคำขอเดิม ไม่สร้างเพียงเพราะ login การยืนยันตัวตนไม่ใช้ชื่อแสดงแทนอีเมล/sub

ตั้งค่า OAuth ตาม `C:\Users\MyLuna\aps-v2-doc\deliverables\aps-v2-google-oauth-setup.md` หลังเพิ่ม Google Client ID/Secret ให้รีสตาร์ต dev server ทุกครั้ง

## ตรวจคุณภาพ

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
npm.cmd run test:integration
npm.cmd run test:e2e:auth
```

`npm.cmd run check` รวม lint, typecheck, unit tests และ build ตามลำดับ รอบ 1 บังคับมี unit tests คำสั่ง typecheck/build สร้าง Prisma Client ก่อน จึงใช้จาก checkout ใหม่ได้

Playwright public suite เปิด production build ที่ port 3100 โดยไม่มี credentials ตรวจหน้าเริ่มต้น keyboard หน้า sign-in ที่ยังไม่พร้อม และ unauthenticated redirect/API ทั้ง desktop/mobile รายงานอยู่ playwright-report

Integration/auth browser tests ใช้ TEST_DATABASE_URL ที่ต้องชี้ local aps_v2_test เท่านั้น ไม่มี reset ใช้ migration deploy และข้อมูลสังเคราะห์ ไม่ใส่ข้อมูลจริงในฐานนี้ รัน integration และ auth browser suite ตามลำดับ ไม่รันพร้อมกันเพราะใช้ฐานทดสอบร่วมกัน

Auth browser suite เปิดที่ localhost:3101 ใช้ TEST_AUTH_SECRET แยกจาก secret แอป เตรียม sessions ผ่าน Better Auth hooks จริงและ signed cookies ใน tests/.auth (ไม่เข้า Git) ไม่มี endpoint bypass ในเว็บ รายงานอยู่ playwright-report-auth ผลเหล่านี้ไม่แทนการทดสอบ Google OAuth จริง

คำสั่ง typecheck สร้าง Next.js types ก่อนตรวจ จึงใช้จาก checkout ใหม่ได้โดยไม่ต้อง build ก่อน ถ้าระบบเปิด network ไม่ได้ ให้รายงาน checks ที่รันไม่ได้ตามจริง

## โครงสร้าง

| ส่วน | หน้าที่ |
|---|---|
| `src/app` | หน้าเริ่มต้น layout styles และเส้นทางเว็บ |
| `src/modules/accounts` | types/validation/permission guards และ unit tests |
| `src/modules/curriculum` | ขอบเขตฉบับหลักสูตร/กฎ/เปิดสอน |
| `src/modules/transcript` | ขอบเขตอ่าน/ตรวจร่าง/ยืนยัน |
| `src/modules/analysis` | ขอบเขตความก้าวหน้า GPA และความเสี่ยง |
| `src/modules/planning` | ขอบเขตแผนรายเทอมและเหตุผล |
| `src/modules/simulation` | ขอบเขต What-if และการเปรียบเทียบ |
| `src/server` | lazy database/auth, identity binding, AccountContext, account CRUD และ errors |
| `prisma` | schema และ migration รอบ 1 |
| `scripts` | setup/bootstrap/ตรวจความพร้อม และ test fixtures |
| `tests` | PostgreSQL integration และ public/auth browser tests |

โมดูลธุรกิจเป็น TypeScript ที่ไม่พึ่งเว็บหรือฐานข้อมูล แผนและ What-if ใช้กลไกเดียวกัน และเก็บฉบับ transcript/หลักสูตร/กลไกที่ใช้คำนวณ

## เดโมกระบวนการวิชาการ

ผู้ดูแลที่ได้รับมอบหมาย CS2565 เปิด `/admin/academic` สร้างร่างเริ่มต้น ตรวจวิชา กฎและการเปิดสอน แล้วบันทึกและเผยแพร่ ฉบับเผยแพร่แก้ตรงไม่ได้ ต้องคัดลอกเป็นร่างใหม่ ข้อมูลเริ่มต้นยังมี OPEN จึงไม่ใช่นโยบายที่ตรวจรับครบ ห้ามลบรายการค้างเพื่อให้ผลดูสมบูรณ์

นักศึกษาที่ได้รับยืนยันบริบทเปิด `/student` นำเข้า PDF ข้อความ ตรวจส่วนหัวและรายการ ยืนยันครั้งเดียว แล้วดูความก้าวหน้า แผนสองสายเมื่อยังไม่เลือกสาย และจำลองเพิ่ม/ถอน/ไม่ผ่านหรือสมมติเปิดสอน ข้อมูลจำลองไม่เขียนกลับฉบับจริง

ฐานข้อมูลเพิ่ม migration โดยสำรอง development database ก่อนด้วย `node scripts/backup-development-database.mjs` สำรองอยู่ใน `storage/backups` ซึ่งไม่เข้า Git ก่อนกู้คืนต้องตรวจปลายทางและใช้ archive ที่ตรวจรายการได้ การ restore ยังไม่ได้ซ้อม จึงไม่ถือว่าปิดงานกู้คืนแล้ว

หลักฐานรอบนี้และรายการที่เหลืออยู่ใน `C:\Users\MyLuna\aps-v2-doc\deliverables\aps-v2-demo-rework-report.md` ไม่มีการ deploy/commit/push จากงานนี้

## เอกสารและรอบถัดไป

- แหล่งข้อกำหนด: `C:\Users\MyLuna\aps-v2-doc\deliverables\aps-v2-requirements-freeze.md`
- แผนพัฒนา: `C:\Users\MyLuna\aps-v2-doc\deliverables\aps-v2-development-plan.md`
- สถานะและหลักฐาน: `C:\Users\MyLuna\aps-v2-doc\deliverables\aps-v2-feature-status.md`

รอบ 1 ใช้ callback `http://localhost:3000/api/auth/callback/google` ([คู่มือ provider](https://better-auth.com/docs/authentication/google)) ผู้ดูแลหลักเพิ่ม/ระงับบัญชีและกำหนดบทบาทได้ที่ /admin/accounts ส่วนผู้ดูแลทั่วไปเข้าถึงเฉพาะหลักสูตรที่มอบหมาย การผูก Google แล้วไม่ให้เปลี่ยนเจ้าของ อีเมล หรือรหัสนักศึกษาผ่านฟอร์ม

`.env.example` มีแต่ placeholders อย่าใส่ค่าลับในไฟล์ตัวอย่างหรือแชต อย่าคัดลอก .env/trace/storage state มาเป็นหลักฐานสาธารณะ รายชื่อ บทบาท และบริบทอยู่บน server ไม่อ่านสิทธิ์จาก PDF หรือ frontend

ใช้ Git ในโฟลเดอร์โปรแกรม ยังไม่มี initial commit/remote/CI และยังไม่ deploy ข้อมูลส่วนตัวอยู่ในพื้นที่จำกัดสิทธิ์นอก public ก่อนออนไลน์ต้องกำหนด retention, backup และทดสอบ restore

## ข้อจำกัดของเครื่องมือตรวจ ณ 13 ตุลาคม 2569

ESLint 9.39.5 ตรง peer dependencies ของ eslint-config-next 16.4.0 แต่ npm แจ้ง deprecated; ESLint 10.12.0 ยังขัดกับ plugins react/import/jsx-a11y ในชุดนี้ จึงไม่ใช้ force หรือ legacy-peer-deps เพื่อข้ามข้อขัดแย้ง

npm audit พบ high 5 รายการจาก advisory เดียวใน dev dependency chain `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces@3.0.3` [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) ยังไม่มี patched version ณ วันที่ตรวจ ไม่ลดรุ่น Next.js หรือลบ rules เพื่อทำให้ audit ผ่าน ต้องตรวจรุ่นแก้ไขของ upstream ก่อนอัปเดตชุดเครื่องมือ ข้อจำกัดนี้ไม่ใช่คำรับรองว่าแอปปลอดภัย

รอบ 1 ตรึง overrides ของ @prisma/config → deepmerge-ts 8.0.2 และ prisma → mysql2 3.24.5 เพื่อแก้ findings ใหม่ ตรวจ Prisma validate/generate/migrate และ tests หลังเปลี่ยนแล้ว ก่อนอัปเดต Prisma ให้ตรวจว่าถอด overrides ได้หรือยัง ผล production audit 0 ไม่รับรองความปลอดภัยทุกกรณี
