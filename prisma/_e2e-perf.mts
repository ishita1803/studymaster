/**
 * Warm navigation timing on the production server: visits each page twice and
 * reports both times, so the second hit shows steady-state server rendering.
 * Run: npx tsx prisma/_e2e-perf.mts
 */
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

  const routes = [
    "/dashboard", "/roadmap", "/subjects", "/notes", "/quizzes",
    "/quizzes/new", "/flashcards", "/flashcards/study", "/focus",
    "/analytics", "/settings", "/achievements",
  ];
  console.log("route | first hit | warm hit");
  for (const route of routes) {
    await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
    const first = Date.now();
    await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
    const firstMs = Date.now() - first;
    const warm = Date.now();
    await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
    const warmMs = Date.now() - warm;
    console.log(`${route} | ${firstMs} ms | ${warmMs} ms`);
  }
} finally {
  await browser.close();
}
