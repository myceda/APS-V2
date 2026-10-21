import Link from "next/link";
import { readPageAccount } from "@/server/page-account";
import { getDatabase } from "@/server/database";
import { AccountProblem, AccountShell } from "@/components/account-shell";
import styles from "@/components/account-shell.module.css";

export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const result = await readPageAccount();
  if (!result.account) return <AccountProblem message={result.error!} />;
  if (result.account.role !== "admin") return <AccountProblem message="บัญชีนี้ไม่มีสิทธิ์ผู้ดูแล" />;
  const account = result.account;
  let curricula, datasets, pending;
  try {
    const db = getDatabase();
    [curricula, datasets, pending] = await Promise.all([
      db.curriculum.findMany({
        where: { id: { in: account.curriculumIds } },
        select: { code: true, name: true },
      }),
      db.academicDataset.findMany({
        where: { curriculumVersion: { curriculumId: { in: account.curriculumIds } } },
        select: { status: true, _count: { select: { courses: true, offerings: true } } },
      }),
      account.canManageAccounts
        ? db.enrollmentRequest.count({ where: { status: "pending", owner: { enrollment: null } } })
        : Promise.resolve(0),
    ]);
  } catch {
    return <AccountProblem message="โหลดงานผู้ดูแลไม่สำเร็จ กรุณาลองอีกครั้ง" />;
  }
  const published = datasets.filter((d) => d.status === "published");
  const drafts = datasets.filter((d) => d.status === "draft");
  return (
    <AccountShell account={account}>
      <section className={styles.card}>
        <span className={styles.eyebrow}>พื้นที่ผู้ดูแล</span>
        <h1>จัดการข้อมูลหลักสูตร</h1>
        <p>เตรียมข้อมูลให้พร้อม เพื่อให้นักศึกษาดูความก้าวหน้าและวางแผนได้</p>
        <Link href="/admin/academic" className={`${styles.button} ${styles.primaryButton}`}>จัดการหลักสูตรและการเปิดสอน</Link>
        <details className={styles.note}>
          <summary>เข้าใช้งานครั้งแรก เริ่มตรงนี้</summary>
          <ol>
            <li>เปิด “จัดการหลักสูตรและการเปิดสอน” แล้วเลือกชุดข้อมูลที่เป็นร่าง</li>
            <li>นำเข้า Excel/CSV หรือแก้รายวิชา ตรวจแถวผิด แล้วบันทึกร่าง</li>
            <li>เติมการเปิดสอนและนโยบายพร้อมที่มา แล้วเปิด “ตรวจและเผยแพร่”</li>
          </ol>
          <p>ข้อมูลที่ยังเป็นร่างจะยังไม่ถูกใช้สร้างแผนให้นักศึกษา</p>
        </details>
        <div className={styles.taskGrid}>
          <Link className={styles.task} href="/admin/academic"><strong>{drafts.length}</strong><span>ร่างหลักสูตรที่ต้องตรวจ</span></Link>
          <Link className={styles.task} href="/admin/academic"><strong>{published.length}</strong><span>ฉบับที่นักศึกษาใช้วางแผนได้</span></Link>
          {account.canManageAccounts && <Link className={styles.task} href="/admin/accounts#review-title"><strong>{pending}</strong><span>ข้อมูลนักศึกษาที่รอตรวจ</span></Link>}
        </div>
        {!published.length && <p className={styles.error}>ยังไม่มีข้อมูลหลักสูตรที่เผยแพร่ นักศึกษายังวิเคราะห์หรือสร้างแผนไม่ได้ เริ่มจากตรวจร่างหลักสูตรและข้อมูลเปิดสอน</p>}
        {drafts.some(d=>!d._count.offerings) && <p className={styles.note}>มีร่างที่ยังไม่มีข้อมูลเปิดสอน กรุณาเติมรายการที่มีหลักฐานก่อนเผยแพร่</p>}
        <p><Link href="/admin/track-criteria">จัดการเกณฑ์เลือกสายและยืนยันปีเข้าศึกษา</Link></p>
      </section>
      <section className={styles.card} aria-labelledby="admin-workflow-heading">
        <h2 id="admin-workflow-heading">เตรียมข้อมูลตามลำดับ</h2>
        <ol className={styles.adminWorkflow}>
          <li><strong>เลือกฉบับและตรวจรายวิชา</strong><p>แก้เฉพาะร่าง ฉบับที่เผยแพร่แล้วเก็บให้นักศึกษาใช้งานต่อ</p><Link href="/admin/academic">เปิดหลักสูตรและการเปิดสอน</Link></li>
          <li><strong>ตรวจเกณฑ์เลือกสาย</strong><p>ระบุรอบ ปีเข้าศึกษา และแหล่งอ้างอิงของแต่ละสายให้ครบ</p><Link href="/admin/track-criteria">เปิดเกณฑ์เลือกสาย</Link></li>
          <li><strong>ตรวจความพร้อมก่อนเผยแพร่</strong><p>ตรวจข้อผิดพลาดและความสามารถที่ข้อมูลยังรองรับไม่ได้ในหน้าชุดข้อมูล</p><Link href="/admin/academic">ตรวจฉบับที่ต้องเผยแพร่</Link></li>
        </ol>
      </section>
      <section className={styles.card}><h2>หลักสูตรที่ได้รับมอบหมาย</h2>{curricula.length ? <ul>{curricula.map(c=><li key={c.code}>{c.code} · {c.name}</li>)}</ul> : <p>ยังไม่มีหลักสูตรที่ดูแล กรุณาติดต่อผู้ดูแลหลัก</p>}
      {account.canManageAccounts && <Link href="/admin/accounts">จัดการบัญชีและสิทธิ์ผู้ใช้</Link>}</section>
    </AccountShell>
  );
}
