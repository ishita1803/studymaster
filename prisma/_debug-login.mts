/** Focused debug: what happens after clicking the login submit button? */
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3000";
const browser = await chromium.launch();
try {
  const page = await (await browser.newContext()).newPage();
  page.on("console", (msg) => console.log(`[console:${msg.type()}]`, msg.text().slice(0, 150)));
  page.on("request", (req) => {
    if (req.resourceType() === "document" || req.url().includes("auth")) {
      console.log(`[req ] ${req.method()} ${req.url().slice(base.length)}`);
    }
  });
  page.on("response", (res) => {
    if (res.request().resourceType() === "document" || res.url().includes("auth")) {
      console.log(`[resp] ${res.status()} ${res.url().slice(base.length)}`);
    }
  });
  page.on("requestfailed", (req) => {
    console.log(`[FAIL] ${req.failure()?.errorText} ${req.method()} ${req.url().slice(base.length)}`);
  });

  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "demo@studymaster.app");
  await page.fill('input[name="password"]', "demo1234");

  const button = page.locator('button[type="submit"]');
  console.log("button count:", await button.count());
  console.log("button text:", (await button.first().textContent())?.trim());
  console.log("button attached:", await button.first().isVisible());
  console.log("form action:", await page.locator("form").evaluate((form) => (form as HTMLFormElement).action));

  console.log("--- clicking ---");
  const start = Date.now();
  await button.first().click();
  try {
    await page.waitForURL(/dashboard/, { timeout: 12_000 });
    console.log(`navigated OK in ${Date.now() - start} ms →`, page.url());
  } catch {
    console.log(`NO navigation after ${Date.now() - start} ms, url:`, page.url());
    console.log("page title:", await page.title());
    const errors = await page.evaluate(() =>
      (window as unknown as { __next_error__?: unknown }).__next_error__ ?? null,
    );
    console.log("next error:", JSON.stringify(errors)?.slice(0, 300));
  }
} finally {
  await browser.close();
}
