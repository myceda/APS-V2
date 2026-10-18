export class AccessError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "AccessError";
  }
}

export function invalidInput(
  message = "กรุณาตรวจข้อมูลที่กรอก",
  fields?: Record<string, string>,
): never {
  throw new AccessError(400, "INVALID_INPUT", message, fields);
}
