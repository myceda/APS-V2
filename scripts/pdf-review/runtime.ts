import { config } from "dotenv";
import { assertDemoDatabase } from "../../src/modules/demo/config";
export const PDF_ORIGIN = "http://localhost:3103";
export function configurePdfReview() {
  config({ quiet: true });
  assertDemoDatabase(process.env.TEST_DATABASE_URL);
  if (!process.env.TEST_AUTH_SECRET || process.env.TEST_AUTH_SECRET.length < 32) throw new Error("TEST_AUTH_SECRET is required");
  if (process.env.TEST_AUTH_SECRET === process.env.BETTER_AUTH_SECRET && !process.env.DATABASE_URL?.includes("/aps_v2_test")) throw new Error("Test secret must be separate");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.BETTER_AUTH_SECRET = process.env.TEST_AUTH_SECRET;
  process.env.BETTER_AUTH_URL = PDF_ORIGIN;
  process.env.APS_DEMO_MODE = "0";
  process.env.GOOGLE_CLIENT_ID = "";
  process.env.GOOGLE_CLIENT_SECRET = "";
}
