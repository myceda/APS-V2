"use client";

import type { ReactNode } from "react";

export function ContentStartLink({ children, className }: { children: ReactNode; className?: string }) {
  return <a className={className} href="#account-content" onClick={event => {
    const main = document.getElementById("account-content");
    if (!main) return;
    // Moving within the page must not create a history event that rechecks the
    // session, temporarily hides the form and drops keyboard focus.
    event.preventDefault();
    main.focus({ preventScroll: true });
    main.scrollIntoView({ block: "start", behavior: "instant" });
  }}>{children}</a>;
}
