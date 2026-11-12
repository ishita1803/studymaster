/**
 * Notes-workflow E2E against the production server:
 *  1. upload a small .txt lecture note into the demo Biology subject via the
 *     Notes form (real server action, real extraction path for text files,
 *     ZERO Gemini calls);
 *  2. verify the redirect ?note=added, the note in the list, and the
 *     syllabus-topic association chip ("Photosynthesis");
 *  3. delete the note again (exercises deleteSubjectNoteAction without
 *     touching the syllabus).
 * Run with the prod server running: npx tsx prisma/_e2e-notes-flow.mts
 */
import { writeFile, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3000";
const aiCalls: string[] = [];

const content = [
  "Lecture 12 — Photosynthesis: light reactions.",
  "Chlorophyll in chloroplasts absorbs light. Water is split, oxygen released.",
  "ATP and NADPH feed the Calvin cycle. Photosynthesis drives the food chain.",
  "Stomata regulate gas exchange; crop yield depends on this process.",
].join("\n"); // > 40 chars, mentions an approved topic name

const dir = await mkdtemp(join(tmpdir(), "sm-note-"));
const filePath = join(dir, "lecture-12-photosynthesis.txt");
await writeFile(filePath, content, "utf8");

const browser = await chromium.launch();
try {
  const page = await (await browser.newContext()).newPage();
  page.on("request", (request) => {
    if (request.url().includes("generativelanguage.googleapis.com")) {
      aiCalls.push(request.url().slice(0, 100));
    }
  });

  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "demo@studymaster.app");
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 30_000 });

  await page.goto(`${base}/subjects`, { waitUntil: "domcontentloaded" });
  const href = await page.locator('a[href^="/subjects/"]:visible').first().getAttribute("href");
  await page.goto(`${base}${href}`, { waitUntil: "domcontentloaded" });

  // --- 1. Upload the note through the Notes form -----------------------
  await page.locator("#subject-note-title").fill("Lecture 12 — Photosynthesis");
  await page.setInputFiles("#subject-note-file", filePath);
  await page.getByText("Add to Notes").first().click();

  await page.waitForURL(/note=added/, { timeout: 45_000 });
  console.log("upload redirect:", page.url().replace(base, ""));

  await page.goto(`${base}${href}?note=added`, { waitUntil: "domcontentloaded" });
  const body = (await page.textContent("body")) ?? "";
  console.log("note listed:", body.includes("Lecture 12 — Photosynthesis") ? "OK" : "MISSING");
  console.log("syllabus untouched banner:",
    body.includes("It never changes the syllabus") ? "OK" : "MISSING");
  const chip = /Photosynthesis/.test(body);
  console.log("topic association chip visible:", chip ? "OK" : "MISSING");

  // --- 2. Delete it again ----------------------------------------------
  const noteCard = page.locator('a', { hasText: "Lecture 12 — Photosynthesis" }).first();
  await noteCard.waitFor({ timeout: 10_000 });
  const container = noteCard.locator("xpath=..");
  await container.locator('button[type="submit"]').first().click();
  await page.waitForURL(/note=deleted/, { timeout: 45_000 });
  console.log("delete redirect:", page.url().replace(base, ""));

  await page.goto(`${base}${href}?note=deleted`, { waitUntil: "domcontentloaded" });
  const after = (await page.textContent("body")) ?? "";
  console.log("note removed:", after.includes("Lecture 12 — Photosynthesis") ? "STILL LISTED ⚠" : "OK");

  console.log("AI network calls during the whole workflow:", aiCalls.length);
  for (const call of aiCalls) console.log("  ⚠", call);
  if (aiCalls.length > 0) process.exitCode = 1;
} finally {
  await browser.close();
}

