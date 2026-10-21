"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useState, type MouseEvent } from "react";
import Link from "next/link";
import { navigateStudent, STUDENT_VIEWS, studentView, type StudentView } from "./student-navigation";
import styles from "./account-shell.module.css";

export function WorkspaceNavigation({ role, canManageAccounts, initialView = "overview" }: {
  role: "student" | "admin";
  canManageAccounts: boolean;
  initialView?: StudentView;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const current = studentView(params.get("view"), initialView).id;
  const links = role === "student"
    ? STUDENT_VIEWS.map(view => ({ href: `/student?view=${view.id}`, label: view.label, active: pathname === "/student" && current === view.id, view: view.id }))
    : [
        { href: "/admin", label: "ภาพรวมผู้ดูแล", active: pathname === "/admin" },
        { href: "/admin/academic", label: "หลักสูตรและการเปิดสอน", active: pathname === "/admin/academic" },
        { href: "/admin/track-criteria", label: "เกณฑ์เลือกสาย", active: pathname === "/admin/track-criteria" },
        ...(canManageAccounts ? [{ href: "/admin/accounts", label: "บัญชีและสิทธิ์ผู้ใช้", active: pathname === "/admin/accounts" }] : []),
      ];
  function follow(event: MouseEvent<HTMLAnchorElement>, view?: StudentView) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (view && pathname === "/student") {
      event.preventDefault();
      navigateStudent(view);
    }
    setOpen(false);
  }
  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarHeading}>
        <span>{role === "student" ? "พื้นที่นักศึกษา" : "พื้นที่ผู้ดูแล"}</span>
        <button className={styles.menuToggle} type="button" aria-expanded={open} aria-controls="workspace-menu" onClick={() => setOpen(!open)}>{open ? "ปิดเมนู" : "เปิดเมนู"}</button>
      </div>
      <nav id="workspace-menu" className={styles.workspaceMenu} data-open={open} aria-label={role === "student" ? "เมนูนักศึกษา" : "เมนูผู้ดูแล"}>
        {links.map(link => <Link key={link.href} href={link.href} aria-current={link.active ? "page" : undefined} onClick={event => follow(event, "view" in link ? link.view : undefined)}>{link.label}</Link>)}
      </nav>
      <p className={styles.sidebarHelp}>{role === "student" ? <>ผลการเรียนที่ยืนยันแล้ว<br />คือจุดเริ่มต้นของทุกแผน</> : <>ข้อมูลฉบับเผยแพร่<br />คือฐานที่นักศึกษาใช้สร้างแผน</>}</p>
    </aside>
  );
}
