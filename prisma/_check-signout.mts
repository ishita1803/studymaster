/**
 * One-off probe: login → sign out must stay on localhost:3000.
 * Run: npx tsx prisma/_check-signout.mts
 */
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3000";
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "demo@studymaster.app");
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 30_000 });
  console.log("login landed on:", page.url());

  // sign out via the settings page or header button
  const signOut = page.locator('[aria-label="Sign out"]').first();
  await signOut.click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForURL(/login|\/$/, { timeout: 30_000 });
  console.log("after sign-out landed on:", page.url());

  const ok = page.url().startsWith("http://localhost:3000");
  console.log(ok ? "SIGNOUT-PORT: PASS (stayed on 3000)" : "SIGNOUT-PORT: FAIL (left 3000)");
} finally {
  await browser.close();
}
