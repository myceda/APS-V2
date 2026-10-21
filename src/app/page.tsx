import styles from "./page.module.css";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAccount } from "@/server/account-context";
import { AccessError } from "@/modules/accounts/errors";
import { AccountProblem } from "@/components/account-shell";

export const dynamic = "force-dynamic";

const steps = [
  {
    title: "นำเข้าผลการเรียน",
    description:
      "ใช้ Transcript PDF ที่มีข้อความ เพื่อเตรียมข้อมูลรายวิชาและผลการเรียน",
    label: "เตรียมเอกสาร",
  },
  {
    title: "ตรวจทานและยืนยัน",
    description:
      "ดูข้อมูลที่อ่านได้ ตรวจเฉพาะจุดที่ต้องแก้ แล้วจึงยืนยันข้อมูลของคุณ",
    label: "คุณเป็นผู้ยืนยัน",
  },
  {
    title: "ดูแผนและลองเปลี่ยน",
    description: "ดูแผนรายเทอมและผลกระทบเมื่อเพิ่ม ถอน หรือไม่ผ่านรายวิชา",
    label: "ภายใต้สมมติฐาน",
  },
];

function PlanIllustration() {
  return <div className={styles.productPreview} aria-label="ตัวอย่างขั้นตอนใน APS">
    <div className={styles.previewHeader}><strong>ผลการเรียน → แผนของคุณ</strong><span>ตัวอย่างหน้าจอ</span></div>
    <div className={styles.previewRow}><span>ความก้าวหน้า</span><strong>เห็นหมวดที่ยังขาด</strong></div>
    <div className={styles.previewRow}><span>แผนรายเทอม</span><strong>เห็นวิชาที่ควรเรียนต่อ</strong></div>
    <div className={styles.previewRow}><span>ลองปรับแผน</span><strong>เห็นผลก่อนตัดสินใจ</strong></div>
    <p>แยกผลการเรียนจริงจากผลคาดการณ์ทุกขั้นตอน</p>
  </div>;
}

export default async function HomePage() {
  let account;
  try {
    account = await requireAccount(await headers());
  } catch (error) {
    if (!(error instanceof AccessError && error.status === 401))
      return <AccountProblem message="ตรวจสอบบัญชีไม่สำเร็จ กรุณาลองเปิดหน้าอีกครั้ง" />;
  }
  if (account) redirect(account.role === "admin" ? "/admin" : "/student");
  return (
    <>
      <a className={styles.skipLink} href="#main-content">
        ข้ามไปเนื้อหาหลัก
      </a>
      <header className={styles.header}>
        <a
          className={styles.brand}
          href="#main-content"
          aria-label="APS หน้าเริ่มต้น"
        >
          <span className={styles.brandMark} aria-hidden="true">
            A<span />
          </span>
          <span>
            <strong>APS</strong>
            <small>Academic Planning System</small>
          </span>
        </a>
        <nav aria-label="เมนูหลัก" className={styles.navigation}>
          <a href="#getting-started">ขั้นตอนใช้งาน</a>
          <a href="#curriculum-scope">ขอบเขตหลักสูตร</a>
          <a href="/sign-in">เข้าสู่ระบบ</a>
        </nav>
      </header>

      <main id="main-content" tabIndex={-1} className={styles.main}>
        <section className={styles.hero} aria-labelledby="welcome-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>เริ่มต้นจากผลการเรียนของคุณ</p>
            <h1 id="welcome-title">
              วางแผนการเรียน
              <br />
              <span>อย่างเข้าใจ</span>
            </h1>
            <p className={styles.intro}>
              เห็นเส้นทางรายวิชา วางแผนทีละเทอม และเข้าใจว่าเมื่อแผนเปลี่ยน
              จะกระทบการเรียนอย่างไร
            </p>
            <a className={styles.primaryLink} href="/sign-in">
              เริ่มวางแผนการเรียน
            </a>
            <p className={styles.heroNote}>
              สำหรับหลักสูตรวิทยาการคอมพิวเตอร์ CS2565
            </p>
          </div>

          <aside
            className={styles.welcomeCard}
            aria-labelledby="preparation-title"
          >
            <div className={styles.status}>
              <span aria-hidden="true" />
              ต้นแบบสำหรับ CS2565
            </div>
            <PlanIllustration />
            <h2 id="preparation-title">เริ่มจากใบผลการเรียนของคุณ</h2>
            <p>
              เตรียมไฟล์ PDF ผลการเรียนที่มีข้อความและเป็นฉบับล่าสุด
              ตรวจข้อมูลก่อนยืนยัน
              แล้วดูความก้าวหน้าและแผนการเรียนของคุณ
            </p>
            <div className={styles.availabilityNote}>
              เข้าสู่ระบบเพื่ออัปโหลดและตรวจทานผลการเรียน
            </div>
          </aside>
        </section>

        <section
          id="getting-started"
          className={styles.section}
          aria-labelledby="steps-title"
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>เส้นทางการใช้งาน</p>
              <h2 id="steps-title">จากผลการเรียน สู่แผนที่เข้าใจได้</h2>
            </div>
            <p>อัปโหลด ตรวจข้อมูล แล้วเริ่มวางแผน</p>
          </div>
          <ol className={styles.steps}>
            {steps.map((step, index) => (
              <li key={step.title} className={styles.step}>
                <span className={styles.stepNumber} aria-hidden="true">
                  0{index + 1}
                </span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <span className={styles.stepLabel}>{step.label}</span>
              </li>
            ))}
          </ol>
        </section>

        <section
          id="curriculum-scope"
          className={styles.scope}
          aria-labelledby="scope-title"
        >
          <div>
            <p className={styles.eyebrow}>หลักสูตรเริ่มต้น</p>
            <h2 id="scope-title">CS2565 · สองเส้นทางการศึกษา</h2>
            <p>
              แยกแผนโครงงานวิจัยและสหกิจศึกษา
              ผลที่ข้อมูลหรือกฎยังไม่ครบจะแสดงข้อจำกัดก่อนใช้วางแผน
            </p>
          </div>
          <ul className={styles.tracks} aria-label="สายการศึกษา">
            <li>โครงงานวิจัย</li>
            <li>สหกิจศึกษา</li>
          </ul>
        </section>

        <aside className={styles.advisory} aria-label="ความหมายของแผนการเรียน">
          <span className={styles.infoMark} aria-hidden="true">
            i
          </span>
          <p>
            แผนการเรียนเป็นข้อมูลช่วยตัดสินใจภายใต้ข้อมูลและสมมติฐานที่ระบุ
            การลงทะเบียนและการสำเร็จการศึกษาต้องตรวจสอบกับอาจารย์ที่ปรึกษาหรือทะเบียน
          </p>
        </aside>
      </main>
      <footer className={styles.footer}>
        <span>APS · Academic Planning System</span>
        <span>วางแผนทีละเทอม เห็นเหตุผลของทุกการเปลี่ยนแปลง</span>
      </footer>
    </>
  );
}
