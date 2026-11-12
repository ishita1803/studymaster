/**
 * Interaction-latency probe: logs in on the PROD server, then clicks through
 * the app like a user (sidebar links, subject sections, planner buttons) and
 * times every client navigation. Flags anything slower than 1s.
 * Run: npx tsx prisma/_perf-clicks.mts [base]
 */
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3000";
const demail = "demo@studymaster.app";

const browser = await chromium.launch();
try {
  const page = await (await browser.newContext()).newPage();
  const timings: { action: string; ms: number; url: string }[] = [];

  const tracked = async (action: string, run: () => Promise<void>) => {
    const start = Date.now();
    await run();
    const ms = Date.now() - start;
    timings.push({ action, ms, url: page.url().replace(base, "") || "(client)" });
  };

  await tracked("login", async () => {
    await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
    await page.fill('input[name="email"]', demail);
    await page.fill('input[name="password"]', "demo1234");
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard/, { timeout: 30_000 });
    // Let the dashboard's warm-up hydration settle before clicking around.
    await page.waitForLoadState("domcontentloaded");
  });

  // Click sidebar links directly by href (client-side navigations).
  const routes = ["/roadmap", "/subjects", "/notes", "/flashcards", "/analytics", "/dashboard"];
  for (const route of routes) {
    await tracked(`click → ${route}`, async () => {
      await page.locator(`a[href="${route}"]`).first().click({ timeout: 10_000 });
      await page.waitForURL(new RegExp(route.slice(1).replace("/", "\\/")), { timeout: 30_000 });
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    });
  }

  // Subject page + its section interaction.
  await tracked("click → subject page", async () => {
    await page.goto(`${base}/subjects`, { waitUntil: "domcontentloaded" });
    await page.locator('a[href^="/subjects/"]').first().click();
    await page.waitForURL(/subjects\/.+/, { timeout: 30_000 });
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  });

  console.log("— interaction timings (client clicks) —");
  let slow = 0;
  for (const { action, ms, url } of timings) {
    const flag = ms >= 1000 ? "  ← SLOW" : "";
    if (ms >= 1000) slow += 1;
    console.log(`${action.padEnd(24)} ${String(ms).padStart(6)} ms → ${url}${flag}`);
  }
  console.log(
    `\n${timings.length} interactions, ${slow} slower than 1 s, ` +
      `max ${Math.max(...timings.map((t) => t.ms))} ms`,
  );
} finally {
  await browser.close();
}
