import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://unconfigured@localhost:5432/aps_v2_dev",
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
