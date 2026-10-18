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
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
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
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
    if (rows.length > 2000 || row.length > 30 || cell.length > 3000)
      throw new Error("CSV มีข้อมูลเกินที่รองรับ");
  }
  if (quoted) throw new Error("CSV ปิดเครื่องหมายคำพูดไม่ครบ");
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}
export function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return '"' + text.replaceAll('"', '""') + '"';
}
