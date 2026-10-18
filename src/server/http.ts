import "server-only";
import { randomUUID } from "node:crypto";
import { AccessError, invalidInput } from "@/modules/accounts/errors";

export function checkMutationOrigin(
  request: Request,
  contentType = "application/json",
) {
  const origin = request.headers.get("origin");
  const expected = new URL(
    process.env.BETTER_AUTH_URL || "http://localhost:3000",
  ).origin;
  if (origin !== expected)
    throw new AccessError(
      403,
      "ORIGIN_FORBIDDEN",
      "คำขอมาจากหน้าที่ไม่ได้รับอนุญาต",
    );
  if (request.headers.get("content-type")?.split(";")[0].trim() !== contentType)
    invalidInput("คำขอต้องเป็น JSON");
}

export async function readJson(
  request: Request,
  limit = 16_384,
): Promise<unknown> {
  if (Number(request.headers.get("content-length") || 0) > limit)
    invalidInput("คำขอมีขนาดเกินที่รองรับ");
  // Stream limits also protect requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) invalidInput();
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      invalidInput("คำขอมีขนาดเกินที่รองรับ");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    invalidInput("รูปแบบคำขอไม่ถูกต้อง");
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof AccessError)
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          fields: error.fields,
        },
      },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "P2002"
  )
    return Response.json(
      {
        error: {
          code: "ACCOUNT_CONFLICT",
          message: "อีเมลหรือรหัสนักศึกษานี้มีในระบบแล้ว",
        },
      },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  const requestId = randomUUID();
  console.error(JSON.stringify({ event: "account_request_failed", requestId }));
  return Response.json(
    {
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "ระบบไม่พร้อมประมวลผล กรุณาลองใหม่หรือติดต่อผู้ดูแล",
        requestId,
      },
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export const privateHeaders = { "Cache-Control": "no-store" };
