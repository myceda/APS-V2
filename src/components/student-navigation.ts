export const STUDENT_VIEWS = [
  { id: "overview", label: "ภาพรวม", tab: 1 },
  { id: "transcript", label: "ผลการเรียน", tab: 0 },
  { id: "progress", label: "ความก้าวหน้าตามหลักสูตร", tab: 4 },
  { id: "compare", label: "เปรียบเทียบสองสาย", tab: 5 },
  { id: "plan", label: "แผนการเรียน", tab: 2 },
  { id: "what-if", label: "ลองปรับแผน", tab: 3 },
] as const;

export type StudentView = (typeof STUDENT_VIEWS)[number]["id"];
export const STUDENT_NAVIGATED = "aps:student-navigated";

export function studentView(value: string | null, fallback: StudentView = "overview") {
  return STUDENT_VIEWS.find(item => item.id === (value ?? fallback)) ?? STUDENT_VIEWS[0];
}

// Next's native history integration updates useSearchParams without replacing
// the workspace component, so an unsaved transcript stays in memory.
export function navigateStudent(view: StudentView) {
  const url = new URL(window.location.href);
  url.searchParams.set("view", view);
  url.hash = "";
  if (url.href !== window.location.href) window.history.pushState(null, "", url);
  window.dispatchEvent(new Event(STUDENT_NAVIGATED));
}
