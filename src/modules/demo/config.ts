export const DEMO_ORIGIN = "http://localhost:3102";
export const DEMO_NOTICE = "ข้อมูลสาธิต — เกณฑ์สมมติ ไม่ใช่ผลอนุมัติจากมหาวิทยาลัย";

export function assertDemoDatabase(value: string | undefined) {
  let url: URL;
  try { url = new URL(value || ""); } catch { throw new Error("เดโมใช้ local aps_v2_test เท่านั้น"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/aps_v2_test") {
    throw new Error("เดโมใช้ local aps_v2_test เท่านั้น");
  }
}

export function demoEnabled(env: Record<string, string | undefined> = process.env) {
  if (env.APS_DEMO_MODE !== "1") return false;
  assertDemoDatabase(env.DATABASE_URL);
  if (env.BETTER_AUTH_URL !== DEMO_ORIGIN) throw new Error("โหมดสาธิตต้องใช้ localhost:3102");
  return true;
}

export function validateRun(run: string) {
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(run)) throw new Error("ชื่อรอบต้องเป็น a-z ตามด้วย a-z/0-9/- ไม่เกิน 32 ตัว");
  return run;
}

export const DEMO_CASES = ["not-selected", "project", "cooperative", "unknown-track", "insufficient-data", "awaiting-criteria", "admin"] as const;
export type DemoCase = typeof DEMO_CASES[number];
export function selectCases(value: string): DemoCase[] {
  if (value === "all") return [...DEMO_CASES];
  const selected = value.split(",");
  if (!selected.length || new Set(selected).size !== selected.length || selected.some(item => !DEMO_CASES.includes(item as DemoCase))) throw new Error("ระบุ --case จากรายการชุดสาธิต หรือ all");
  return selected as DemoCase[];
}
