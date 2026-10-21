"use client";

import { useEffect } from "react";
import { STUDENT_NAVIGATED } from "./student-navigation";

export const BEFORE_LEAVE = "aps:before-leave";
export const SESSION_RECHECK = "aps:session-recheck";

export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    let leaving = false;
    const workspacePath = window.location.pathname;
    const entryUrl = window.location.href;
    const entryState = window.history.state;
    const marker = crypto.randomUUID();
    // The router can replace the page before a later popstate listener runs.
    // A same-page boundary lets Back ask while the form is still mounted.
    window.history.pushState({ ...entryState, apsDraftGuard: marker }, "", entryUrl);
    let currentUrl = window.location.href;
    let currentState = window.history.state;
    function rememberLocation() {
      currentUrl = window.location.href;
      currentState = window.history.state;
    }
    function confirmLeave() {
      if (leaving) return true;
      leaving = window.confirm("มีข้อมูลที่ยังไม่บันทึก หากออกจากหน้านี้การแก้ไขจะหาย ต้องการออกหรือไม่?");
      return leaving;
    }
    function unload(event: BeforeUnloadEvent) {
      if (!leaving) {
        event.preventDefault();
        event.returnValue = "";
        window.dispatchEvent(new Event(SESSION_RECHECK));
      }
    }
    function click(event: MouseEvent) {
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download") || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const target = new URL(link.href, window.location.href);
      const sameWorkspace = target.origin === location.origin && target.pathname === location.pathname;
      if (!sameWorkspace && !confirmLeave()) { event.preventDefault(); event.stopPropagation(); }
    }
    function beforeLeave(event: Event) { if (!confirmLeave()) event.preventDefault(); }
    function traverse(event: PopStateEvent) {
      const atBoundary = window.location.href === entryUrl && window.history.state?.apsDraftGuard !== marker;
      if (atBoundary && !leaving) {
        event.stopImmediatePropagation();
        if (confirmLeave()) window.history.back();
        else {
          window.history.pushState({ ...entryState, apsDraftGuard: marker }, "", entryUrl);
          rememberLocation();
          window.dispatchEvent(new Event(SESSION_RECHECK));
        }
      } else if (window.location.pathname !== workspacePath && !confirmLeave()) {
        // popstate itself cannot be cancelled. Keep Next from replacing the
        // mounted form and restore the current entry with its router state.
        event.stopImmediatePropagation();
        window.history.pushState(currentState, "", currentUrl);
        window.dispatchEvent(new Event(SESSION_RECHECK));
      } else rememberLocation();
    }
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    window.addEventListener(BEFORE_LEAVE, beforeLeave);
    window.addEventListener("popstate", traverse, true);
    window.addEventListener(STUDENT_NAVIGATED, rememberLocation);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
      window.removeEventListener(BEFORE_LEAVE, beforeLeave);
      window.removeEventListener("popstate", traverse, true);
      window.removeEventListener(STUDENT_NAVIGATED, rememberLocation);
      if (window.history.state?.apsDraftGuard === marker) {
        const state = { ...window.history.state };
        delete state.apsDraftGuard;
        window.history.replaceState(state, "", window.location.href);
      }
    };
  }, [dirty]);
}
