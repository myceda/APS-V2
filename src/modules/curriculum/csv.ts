export const COURSE_COLUMNS = [
  "code",
  "name",
  "credits",
  "category",
  "tracks",
  "grading",
  "specific",
  "prerequisite_mode",
  "prerequisite_courses",
  "concurrent",
  "requires_consent",
  "source",
];
export function parseCsvRows(text: string): { row: number; values: string[] }[] {
  const rows: { row: number; values: string[] }[] = [];
  let line = 1, startLine = 1;
  let row: string[] = [],
    cell = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < text.length; index++) {
    const ch = text[index];
    if (ch === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (quoted) quoted = false;
      else if (!cell.length) quoted = true;
      else throw new Error("เครื่องหมายคำพูดใน CSV ไม่ถูกต้อง");
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[index + 1] === "\n") index++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push({ row: startLine, values: row });
      line++;
      startLine = line;
      row = [];
      cell = "";
    } else {
      cell += ch;
      if (ch === "\n" || (ch === "\r" && text[index + 1] !== "\n")) line++;
    }
    if (rows.length > 2000 || row.length > 30 || cell.length > 3000)
      throw new Error("CSV มีข้อมูลเกินที่รองรับ");
  }
  if (quoted) throw new Error("CSV ปิดเครื่องหมายคำพูดไม่ครบ");
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push({ row: startLine, values: row });
  if (rows.length > 2001) throw new Error("CSV มีข้อมูลเกินที่รองรับ");
  return rows;
}
export function parseCsv(text: string): string[][] {
  return parseCsvRows(text).map(row => row.values);
}
export function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return '"' + text.replaceAll('"', '""') + '"';
}
