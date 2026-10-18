import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { AccessError } from "@/modules/accounts/errors";

const databaseGlobal = globalThis as unknown as { apsPrisma?: PrismaClient };

export function getDatabase() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString)
    throw new AccessError(
      503,
      "DATABASE_NOT_CONFIGURED",
      "ระบบยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแล",
    );
  if (!databaseGlobal.apsPrisma)
    databaseGlobal.apsPrisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
      log: [],
    });
  return databaseGlobal.apsPrisma;
}
