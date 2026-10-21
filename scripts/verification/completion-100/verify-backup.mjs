import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const docs = path.resolve(root, "../aps-v2-doc/deliverables/completion-100");
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  let httpRequests = 0;
  await page.route(/^https?:/, route => { httpRequests++; return route.abort(); });
  await page.goto(pathToFileURL(path.join(docs, "backup.html")).href);
  // Decode every local image including the lazy-loaded ones without network.
  const images = await page.evaluate(async () => Promise.all([...document.images].map(async img => {
    await img.decode(); return { loaded: img.complete && img.naturalWidth > 0, width: img.naturalWidth, height: img.naturalHeight };
  })));
  if (!images.length || images.some(i => !i.loaded) || httpRequests) throw new Error("Offline backup did not load cleanly");
  const last = page.getByRole("navigation", { name: "เลือกภาพ" }).getByRole("link").last();
  await last.focus(); await page.keyboard.press("Enter");
  if (!new URL(page.url()).hash.startsWith("#image-")) throw new Error("Keyboard image navigation failed");
  await writeFile(path.join(docs, "backup-check.json"), JSON.stringify({ checkedAt: new Date().toISOString(), status: "passed", localImagesLoaded: images.length, httpRequests, keyboardAnchor: "passed", visualQa: "Image decoding/navigation only, not individual visual inspection of all frames" }, null, 2) + "\n");
  console.log(`Offline backup passed: ${images.length} images, ${httpRequests} HTTP requests, keyboard anchor passed`);
} finally { await browser.close(); }
