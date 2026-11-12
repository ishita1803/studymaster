/** Hash-skip E2E: click "Re-detect all documents" on the demo subject and
 * verify it short-circuits with `syllabus=current` and zero AI usage.
 * Run with the prod server already running: npx tsx prisma/_e2e-hashskip.mts
 */
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3000";
const aiCalls: string[] = [];

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
  console.log("subject:", href);

  const started = Date.now();
  await page.goto(`${base}${href}`, { waitUntil: "domcontentloaded" });

  await page.getByText("Re-detect all documents").first().click();
  // The action redirects back with ?syllabus=current&count=…
  await page.waitForURL(/syllabus=current/, { timeout: 30_000 });
  const ms = Date.now() - started;
  console.log("redirect:", page.url().replace(base, ""));
  console.log(`short-circuit elapsed: ${ms} ms`);

  const banner = (await page.textContent("body")) ?? "";
  const ok = banner.includes("already up to date");
  console.log("banner text present:", ok ? "OK" : "MISSING");
  console.log("AI network calls during re-detect:", aiCalls.length);
  for (const call of aiCalls) console.log("  ⚠", call);

  if (!ok || aiCalls.length > 0) process.exitCode = 1;
} finally {
  await browser.close();
}
