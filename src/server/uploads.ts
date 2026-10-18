import "server-only";
import { AccessError } from "@/modules/accounts/errors";
import { checkMutationOrigin } from "./http";
export async function readUpload(
  request: Request,
  maxBytes = 10 * 1024 * 1024,
) {
  checkMutationOrigin(request, "multipart/form-data");
  const totalLimit = maxBytes + 64 * 1024;
  if (Number(request.headers.get("content-length") || 0) > totalLimit)
    throw new AccessError(413, "UPLOAD_TOO_LARGE", "ไฟล์มีขนาดเกินที่รองรับ");
  const reader = request.body?.getReader();
  if (!reader) throw new AccessError(422, "UPLOAD_REQUIRED", "กรุณาเลือกไฟล์");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > totalLimit) {
      await reader.cancel();
      throw new AccessError(413, "UPLOAD_TOO_LARGE", "ไฟล์มีขนาดเกินที่รองรับ");
    }
    chunks.push(chunk.value);
  }
  let form: FormData;
  try {
    form = await new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: Buffer.concat(chunks),
    }).formData();
  } catch {
    throw new AccessError(422, "UPLOAD_INVALID", "รูปแบบอัปโหลดไม่ถูกต้อง");
  }
  const file = form.get("file");
  if (!(file instanceof File) || !file.size || file.size > maxBytes)
    throw new AccessError(
      422,
      "UPLOAD_REQUIRED",
      "กรุณาเลือกไฟล์ที่มีข้อมูลและขนาดไม่เกินที่กำหนด",
    );
  return { file, form, content: new Uint8Array(await file.arrayBuffer()) };
}
