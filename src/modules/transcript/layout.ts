import {
  GRADES,
  type Attempt,
  type TranscriptHeader,
  type ReportedSummary,
  type HeaderField,
} from "./types";
export interface TextItem {
  str: string;
  transform: number[];
  width: number;
}
export interface TextLine {
  y: number;
  items: { text: string; x: number; width: number }[];
}
export interface PageContext {
  kind: Attempt["kind"];
  year: number | null;
  semester: number | null;
}
const codePattern = /^(?:\d{6}|SU\d{3})$/;
const numeric = /^\d+(?:\.\d+)?$/;
export class TranscriptReadError extends Error {
  readonly code = "PDF_GRADE_UNSUPPORTED";
  constructor() {
    super("พบสัญลักษณ์เกรดที่อ่านไม่ได้หรือยังไม่รองรับ กรุณาตรวจต้นฉบับหรือขอ PDF ใหม่จากทะเบียน");
  }
}
export function groupLines(items: TextItem[]): TextLine[] {
  const lines: TextLine[] = [];
  for (const item of items
    .filter((i) => i.str.trim())
    .sort(
      (a, b) =>
        b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4],
    )) {
    let line = lines.find((l) => Math.abs(l.y - item.transform[5]) <= 1.2);
    if (!line) {
      line = { y: item.transform[5], items: [] };
      lines.push(line);
    }
    line.items.push({
      text: item.str.normalize("NFKC").replaceAll("\u0000", "").trim(),
      x: item.transform[4],
      width: item.width,
    });
  }
  for (const line of lines) line.items.sort((a, b) => a.x - b.x);
  return lines.sort((a, b) => b.y - a.y);
}
function field(value: string | null): HeaderField {
  return { value, state: value ? "present" : "unreadable", sourcePage: 1 };
}
export function parseHeader(lines: TextLine[]): TranscriptHeader {
  const strings = lines.map((line) =>
    line.items
      .map((i) => i.text)
      .join("")
      .replace(/\s+/g, " "),
  );
  const identityLine = lines.find((line) =>
    /^\d{7,14}\s*[:：]/.test(
      line.items
        .filter((i) => i.x < 300)
        .map((i) => i.text)
        .join(""),
    ),
  );
  if (identityLine) {
    const identityText = identityLine.items
      .map((i) => i.text.replace(/\s/g, ""))
      .join("");
    const statusOffset = identityText.indexOf("สถานภาพนักศึกษา");
    let length = 0;
    const statusItem = identityLine.items.find((item) => {
      length += item.text.replace(/\s/g, "").length;
      return statusOffset >= 0 && length > statusOffset;
    });
    const split = statusItem ? statusItem.x - 1 : 300;
    const cells = (line: TextLine, side: "left" | "right") =>
      line.items
        .filter((i) => (side === "left" ? i.x < split : i.x >= split))
        .map((i) => i.text)
        .join("")
        .trim();
    const rows = lines.filter(
      (l) => l.y < identityLine.y - 2 && l.y > identityLine.y - 115,
    );
    const identity = cells(identityLine, "left").match(
      /^(\d{7,14})\s*[:：]\s*(.+)$/,
    );
    const campus = rows[0] && cells(rows[0], "left"),
      degree = rows[0] && cells(rows[0], "right");
    const faculty = rows[1] && cells(rows[1], "left"),
      department = rows[1] && cells(rows[1], "right");
    const program =
      rows[2] &&
      rows[2].items
        .map((i) => i.text)
        .join("")
        .trim();
    // This unlabeled 2-column header is verified against the agreed registrar layout.
    if (
      identity &&
      degree?.includes("ปริญญา") &&
      department?.includes("ภาควิชา") &&
      program?.includes("วิทยาการคอมพิวเตอร์")
    ) {
      const compact = program.replace(/\s/g, "");
      const project =
          compact.includes("โครงงานวิจัย") || compact.includes("โครงการวิจัย"),
        cooperative = compact.includes("สหกิจศึกษา");
      const track =
        project && !cooperative
          ? ("project" as const)
          : cooperative && !project
            ? ("cooperative" as const)
            : null;
      return {
        studentCode: field(identity[1]),
        studentName: field(identity[2]),
        faculty: field(faculty),
        department: field(department),
        degree: field(degree),
        program: field(program),
        campus: field(campus),
        studentStatus: field(cells(identityLine, "right")),
        track,
        trackState: track
          ? "selected"
          : project || cooperative
            ? "unknown"
            : "not_selected",
      };
    }
  }
  const find = (patterns: RegExp[]) => {
    for (const pattern of patterns)
      for (const line of strings) {
        const match = line.match(pattern);
        if (match?.[1]?.trim()) return match[1].trim();
      }
    return null;
  };
  const studentCode = find([
    /(?:รหัสนักศึกษา|เลขประจำตัวนักศึกษา|Student\s*(?:ID|No\.?))\s*[:：]?\s*(\d{7,14})/i,
  ]);
  const studentName = find([
    /(?:ชื่อ\s*[-–]?\s*นามสกุล|ชื่อ\s*นักศึกษา|Name)\s*[:：]?\s*(.+?)(?=\s+(?:รหัส|คณะ|Faculty|Student)|$)/i,
  ]);
  const faculty = find([
    /คณะ\s*[:：]?\s*(.+?)(?=\s+(?:ภาควิชา|สาขาวิชา|ระดับ|Department)|$)/,
    /Faculty\s*:\s*(.+)/i,
  ]);
  const department = find([
    /ภาควิชา\s*[:：]?\s*(.+?)(?=\s+(?:สาขาวิชา|ระดับ|ชื่อสาขา)|$)/,
    /Department\s*:\s*(.+)/i,
  ]);
  const degree = find([
    /(?:ระดับ(?:การศึกษา)?|Degree)\s*[:：]?\s*(.+?)(?=\s+(?:คณะ|ภาควิชา|สาขาวิชา)|$)/i,
  ]);
  const program = find([
    /(?:ชื่อสาขา(?:วิชา)?|สาขาวิชา|Major|Program)\s*[:：]?\s*(.+)/i,
  ]);
  const programText = (
    program ??
    strings.find((s) => s.includes("วิทยาการคอมพิวเตอร์")) ??
    ""
  ).replace(/\s/g, "");
  const project =
    programText?.includes("โครงงานวิจัย") ||
    programText?.includes("โครงการวิจัย");
  const cooperative = programText?.includes("สหกิจศึกษา");
  const track =
    project && !cooperative
      ? ("project" as const)
      : cooperative && !project
        ? ("cooperative" as const)
        : null;
  const complete = [
    studentCode,
    studentName,
    faculty,
    department,
    degree,
    program,
  ].every(Boolean);
  return {
    studentCode: field(studentCode),
    studentName: field(studentName),
    faculty: field(faculty),
    department: field(department),
    degree: field(degree),
    program: field(program),
    track,
    trackState: track
      ? "selected"
      : complete && !project && !cooperative
        ? "not_selected"
        : "unknown",
    campus: { value: null, state: "not_present", sourcePage: 1 },
    studentStatus: { value: null, state: "not_present", sourcePage: 1 },
  };
}
export function parsePage(
  lines: TextLine[],
  width: number,
  page: number,
  initial: PageContext,
  offset: number,
) {
  const attempts: Attempt[] = [],
    summaryMap = new Map<string, ReportedSummary>();
  const gpaHeadings = { left: false, right: false };
  let summarySplit = width / 2;
  let context = { ...initial },
    creditX: number | null = null;
  for (const line of lines) {
    const compact = line.items.map((i) => i.text).join("");
    if (compact.includes("รายวิชาโอนย้าย"))
      context = { kind: "transfer", year: null, semester: null };
    const term = compact.match(
      /(?:ภาคการศึกษา.{0,8}?|Semester\s*)([123])\/(25\d{2})/i,
    );
    if (term)
      context = {
        kind: "semester",
        year: Number(term[2]),
        semester: Number(term[1]),
      };
    if (compact.includes("รหัสวิชา") && compact.includes("หน่วยกิต")) {
      const position = compact.indexOf("หน่วยกิต");
      let cumulative = 0;
      const item = line.items.find((i) => {
        cumulative += i.text.length;
        return cumulative > position;
      });
      if (item) creditX = item.x - width * 0.03;
    }
    const code = line.items.find(
      (i) => codePattern.test(i.text) && i.x < width * 0.25,
    );
    // The reported latest values precede the term/transfer tables. Keep them in
    // distinct records so a transfer table with no term cannot overwrite GPAX.
    if (!code && page === 1 && context.kind === "unknown") {
      const latestValues = [...compact.replace(/\s/g, "").matchAll(
        /ผลการเรียนเฉลี[่]?ย(สะสม|ภาคล่าสุด|เทอมล่าสุด)[:：]?(\d+(?:\.\d+)?)/g,
      )];
      if (latestValues.length) {
        for (const match of latestValues) {
          const cumulative = match[1] === "สะสม";
          const kind = cumulative ? "latest_cumulative" : "latest_semester";
          summaryMap.set(`${kind}:null:null`, {
            sourcePage: page, year: null, semester: null, kind,
            fields: { [cumulative ? "gpax" : "gpa"]: match[2] },
          });
        }
        continue;
      }
    }
    if (!code) {
      const completeLine = line.items
        .map((i) => i.text.replace(/\s/g, ""))
        .join("");
      const crPositions = [...completeLine.matchAll(/CR[:：]\d/g)];
      if (crPositions.length === 2) {
        let offset = 0;
        const rightStart = line.items.find((item) => {
          offset += item.text.replace(/\s/g, "").length;
          return offset > crPositions[1].index!;
        });
        if (rightStart) summarySplit = rightStart.x - 1;
      }
      for (const side of ["left", "right"] as const) {
        const cell = line.items
          .filter((i) =>
            side === "left" ? i.x < summarySplit : i.x >= summarySplit,
          )
          .map((i) => i.text)
          .join("")
          .replace(/\s/g, "");
        const kind =
          context.kind === "unknown" &&
          /ผลการเรียนเฉลี[่]?ยภาคล่าสุด/.test(cell)
            ? ("latest_semester" as const)
            : side === "left"
              ? ("semester" as const)
              : ("cumulative" as const);
        const key = `${kind}:${context.year}:${context.semester}`;
        const fields: Record<string, string> = {};
        for (const label of ["CR", "CP", "CA", "GP"] as const) {
          const match = cell.match(
            new RegExp(`(?:^|[^A-Z])${label}[:：](\\d+(?:\\.\\d+)?)`),
          );
          if (match) fields[label] = match[1];
        }
        if (cell.includes("GPA")) gpaHeadings[side] = true;
        const latest = cell.match(
          /ผลการเรียนเฉลี[่]?ย(?:สะสม|ภาคล่าสุด)(\d+(?:\.\d+)?)/,
        );
        if (latest) fields[side === "left" ? "gpa" : "gpax"] = latest[1];
        const gpa =
          cell.match(/เฉลี[่]?ย(?:สะสม)?[:：](\d+(?:\.\d+)?)/) ??
          (gpaHeadings[side]
            ? cell.match(/^สะสม[:：](\d+(?:\.\d+)?)/)
            : null) ??
          (gpaHeadings[side] && /^\d+(?:\.\d+)?$/.test(cell)
            ? [cell, cell]
            : null);
        if (gpa) {
          fields[side === "left" ? "gpa" : "gpax"] = gpa[1];
          gpaHeadings[side] = false;
        }
        const status = cell.match(/ระดับผลการเรียน(.+)/);
        if (status) fields.status = status[1];
        if (Object.keys(fields).length) {
          const summary = summaryMap.get(key) ?? {
            sourcePage: page,
            year: context.year,
            semester: context.semester,
            kind,
            fields: {},
          };
          Object.assign(summary.fields, fields);
          summaryMap.set(key, summary);
        }
      }
      continue;
    }
    const tail = line.items
      .filter((i) => i.x > (creditX ?? width * 0.64))
      .map((i) => i.text)
      .filter(Boolean);
    const grade = GRADES.includes(tail[1] as (typeof GRADES)[number])
      ? tail[1]
      : null;
    // A visible, unrecognized symbol is not the same as an empty grade cell.
    if (!grade && tail[1] && !(tail.length === 2 && numeric.test(tail[1])))
      throw new TranscriptReadError();
    const points = grade
      ? tail[2]
      : tail.length === 2 && numeric.test(tail[1])
        ? tail[1]
        : null;
    const neighbourRows = lines.filter(
      (candidate) =>
        candidate !== line &&
        candidate.items.some(
          (i) => codePattern.test(i.text) && i.x < width * 0.25,
        ),
    );
    const above = neighbourRows
      .filter((l) => l.y > line.y)
      .sort((a, b) => a.y - b.y)[0];
    const below = neighbourRows
      .filter((l) => l.y < line.y)
      .sort((a, b) => b.y - a.y)[0];
    const top = above ? (above.y + line.y) / 2 : line.y + 22,
      bottom = below ? (below.y + line.y) / 2 : line.y - 22;
    const creditItem = line.items.find(
      (i) => i.x > (creditX ?? width * 0.64) && numeric.test(i.text),
    );
    const nameLimit = creditItem ? creditItem.x - 4 : (creditX ?? width * 0.64);
    const inlineName = line.items
      .filter((i) => i.x > code.x + code.width && i.x < nameLimit)
      .map((i) => i.text)
      .join("");
    const name =
      inlineName ||
      lines
        .filter((l) => l.y < top && l.y > bottom)
        .map((l) =>
          l.items
            .filter((i) => i.x > code.x + code.width && i.x < nameLimit)
            .map((i) => i.text)
            .join(""),
        )
        .filter(Boolean)
        .join(" ");
    attempts.push({
      ordinal: offset + attempts.length,
      courseCode: code.text,
      name,
      credits: numeric.test(tail[0] ?? "") ? Number(tail[0]) : null,
      grade,
      gradePoints: numeric.test(points ?? "") ? Number(points) : null,
      ...context,
      sourcePage: page,
    });
  }
  return { attempts, summaries: [...summaryMap.values()], context };
}
