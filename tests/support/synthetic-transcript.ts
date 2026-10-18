// Minimal ASCII PDF fixture with explicit, synthetic identity and course data.
export function syntheticTranscript(studentCode: string, grade = "B", courses = [{ code: "101001", name: "Synthetic Course One" }]) {
  const draw = (x: number, y: number, text: string) =>
    `BT /F1 11 Tf ${x} ${y} Td (${text.replace(/[\\()]/g, "\\$&")}) Tj ET`;
  const lines = [
    draw(30, 780, `Student ID: ${studentCode}`),
    draw(30, 760, "Name: Synthetic Student"),
    draw(30, 740, "Faculty: Science"),
    draw(30, 720, "Department: Computing"),
    draw(30, 700, "Degree: Bachelor"),
    draw(30, 680, "Program: Computer Science"),
    draw(30, 600, "Semester 1/2568"),
    ...courses.flatMap((course, index) => [
      draw(20, 550 - index * 28, course.code),
      draw(100, 550 - index * 28, course.name),
      draw(410, 550 - index * 28, "3"),
      draw(465, 550 - index * 28, grade),
      draw(525, 550 - index * 28, grade === "F" ? "0" : "9"),
    ]),
  ];
  const content = lines.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [i, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  }
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => String(o).padStart(10, "0") + " 00000 n \n")
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(pdf);
}
