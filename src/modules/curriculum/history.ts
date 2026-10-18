import { record } from "./validation";

export interface HistoryQuery { versionId?: string; beforeVersion?: number; afterVersion?: number }
export function historyId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
    throw new Error("รหัสฉบับข้อมูลหรือหลักสูตรไม่ถูกต้อง");
  return value;
}
export function parseHistoryQuery(value: unknown): HistoryQuery {
  const input = record(value);
  if (input.beforeVersion !== undefined && input.afterVersion !== undefined)
    throw new Error("เลือกทิศทางประวัติได้ครั้งละหนึ่งทาง");
  const result: HistoryQuery = {};
  if (input.versionId !== undefined) result.versionId = historyId(input.versionId);
  for (const key of ["beforeVersion", "afterVersion"] as const) {
    if (input[key] === undefined) continue;
    const v = input[key];
    if ((typeof v !== "string" && typeof v !== "number") || !/^[1-9]\d*$/.test(String(v)) || !Number.isSafeInteger(Number(v)) || Number(v) > 2_147_483_647)
      throw new Error("เลขฉบับประวัติต้องเป็นจำนวนเต็มบวกที่รองรับ");
    result[key] = Number(v);
  }
  return result;
}
