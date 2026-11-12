/** Debug: open subject with ?syllabus=current and print the banner region. */
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:3000";
const browser = await chromium.launch();
try {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "demo@studymaster.app");
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 30_000 });
  await page.goto(
    `${base}/subjects/cmw1lb34h0002toaksb68b03r?syllabus=current&count=5`,
    { waitUntil: "domcontentloaded" },
  );
  const body = (await page.textContent("body")) ?? "";
  const index = body.indexOf("up to date");
  console.log("found at:", index);
  console.log("snippet:", index >= 0 ? body.slice(Math.max(0, index - 80), index + 120) : body.slice(0, 300));
} finally {
  await browser.close();
}
