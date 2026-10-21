import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { configureDemo } from "../../demo/runtime";
import { openDemo } from "../../demo/open";
import { DEMO_NOTICE } from "../../../src/modules/demo/config";

configureDemo();
const root = fileURLToPath(new URL("../../../", import.meta.url));
const docs = path.resolve(root, "../aps-v2-doc/deliverables/completion-100");
const kit = JSON.parse(await readFile(path.join(docs, "user-trial-ready.json"), "utf8"));
const { readManifest, fingerprint, sameSnapshot } = await import("../../demo/store");
const { getDatabase } = await import("../../../src/server/database");
const manifest = await readManifest(kit.run);
const windows: { role: string; width: number; height: number; availableWidth: number; availableHeight: number }[] = [];
try {
  const outside = await fingerprint(manifest, false);
  const business = await fingerprint(manifest, true);
  await openDemo(kit.run, ["not-selected", "admin"], { headless: false, onReady: async (_browser, contexts) => {
    for (const [index, context] of contexts.entries()) {
      const page = context.pages()[0];
      await page.getByText(DEMO_NOTICE, { exact: true }).waitFor({ state: "visible" });
      const size = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, availableWidth: screen.availWidth, availableHeight: screen.availHeight }));
      assert.ok(size.width > 0 && size.height > 0 && size.availableWidth > 0 && size.availableHeight > 0);
      assert.ok(size.width <= size.availableWidth, "Demo viewport extends beyond the actual display width");
      assert.ok(size.height <= size.availableHeight, "Demo viewport extends beyond the actual display height");
      const role = index === 0 ? "student" : "admin";
      windows.push({ role, ...size });
      await page.screenshot({ path: path.join(docs, `exam-2026-10-21/ux-repair/round-3/window-${role}.png`) });
    }
  } });
  assert.ok(sameSnapshot(business, await fingerprint(manifest, true)), "Business data changed while inspecting window sizes");
  assert.ok(sameSnapshot(outside, await fingerprint(manifest, false)), "Data outside this demo changed");
  const result = { checkedAt: new Date().toISOString(), status: "passed", method: "Headed Chromium through the actual demo launcher on this machine; synthetic sessions, not Google", windows, businessUnchanged: true, outsideUnchanged: true, humanTrialPassed: false };
  await writeFile(path.join(docs, "exam-2026-10-21/ux-repair/round-3/window-check.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
} finally { await getDatabase().$disconnect(); }
