import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";
config({ quiet: true });
const target = new URL(process.env.TEST_DATABASE_URL || "");
if (
  target.pathname !== "/aps_v2_test" ||
  !["localhost", "127.0.0.1"].includes(target.hostname)
)
  throw new Error("Integration tests require local aps_v2_test");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!process.env.TEST_AUTH_SECRET || process.env.TEST_AUTH_SECRET.length < 32)
  throw new Error("TEST_AUTH_SECRET is required");
process.env.BETTER_AUTH_SECRET = process.env.TEST_AUTH_SECRET;
process.env.BETTER_AUTH_URL = "http://localhost:3101";
// Synthetic provider settings enable mocked OAuth callbacks, never real Google.
process.env.GOOGLE_CLIENT_ID = "fixture-client";
process.env.GOOGLE_CLIENT_SECRET = "fixture-client-secret";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./tests/support/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
