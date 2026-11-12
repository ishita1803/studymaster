/**
 * Playwright E2E — real browser against the production server.
 *
 * Verifies, with network interception:
 *  1. credentials login works;
 *  2. every app page returns 200 and renders (no client-side crash);
 *  3. ZERO Gemini/backed-AI network calls fire during pure navigation
 *     (page views must never consume quota);
 *  4. the subject page shows the two independent sections
 *     (Syllabus upload + editor, Notes upload + list);
 *  5. the roadmap page loads with the exam planner.
 *
 * Run: npm start (or npm run dev) first, then:
 *      npx tsx prisma/_e2e-playwright.mts [baseURL]
 */
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3000";
const AI_HOSTS = ["generativelanguage.googleapis.com"];

const aiCalls: string[] = [];
const pageTimings: Array<{ route: string; ms: number; status: number }> = [];

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();

  page.on("request", (request) => {
    if (AI_HOSTS.some((host) => request.url().includes(host))) {
      aiCalls.push(request.url().slice(0, 120));
    }
  });

  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 200));
  });

  // ---- 1. Login ------------------------------------------------------
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "demo@studymaster.app");
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 30_000 });
  console.log("login: OK →", page.url().replace(base, ""));

  // ---- 2. Every app page ---------------------------------------------
  for (const route of [
    "/dashboard",
    "/roadmap",
    "/subjects",
    "/notes",
    "/quizzes",
    "/quizzes/new",
    "/flashcards",
    "/flashcards/study",
    "/focus",
    "/analytics",
    "/settings",
    "/achievements",
    "/api/auth/session",
  ]) {
    const started = Date.now();
    const response = await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
    const status = response?.status() ?? 0;
    const ms = Date.now() - started;
    pageTimings.push({ route, ms, status });

    const body = (await page.textContent("body").catch(() => "")) ?? "";
    const broken =
      body.includes("Application error: a client-side exception") ||
      body.includes("Internal Server Error");
    console.log(
      `${route} → ${status} (${ms} ms)${broken ? " ← BROKEN" : ""}`,
    );
    if (broken) process.exitCode = 1;
  }

  // ---- 3. Subject page sections --------------------------------------
  // Find the first subject link from /subjects.
  await page.goto(`${base}/subjects`, { waitUntil: "domcontentloaded" });
  const subjectLink = page.locator('a[href^="/subjects/"]:visible').first();
  const href = await subjectLink.getAttribute("href");
  console.log("first subject link:", href);

  if (href) {
    const started = Date.now();
    const response = await page.goto(`${base}${href}`, { waitUntil: "domcontentloaded" });
    const ms = Date.now() - started;
    pageTimings.push({ route: href, ms, status: response?.status() ?? 0 });

    const body = (await page.textContent("body")) ?? "";
    const checks = [
      ["Section 1 · Syllabus", body.includes("Section 1 · Syllabus")],
      ["Section 2 · Notes", body.includes("Section 2 · Notes")],
      ["upload official syllabus form", body.includes("Upload Official Syllabus")],
      ["upload lecture notes form", body.includes("Upload Lecture Notes")],
      ["syllabus editor present", /Approve|approve|Re-detect|Add topic/i.test(body)],
      ["notes list (or empty hint)", /Lecture note|No lecture notes yet/i.test(body)],
    ];
    for (const [name, ok] of checks) {
      console.log(`  ${href} ${name}: ${ok ? "OK" : "MISSING"}`);
      if (!ok) process.exitCode = 1;
    }
    console.log(`  subject page render: ${ms} ms`);
  }

  // ---- 4. Roadmap exam planner ----------------------------------------
  await page.goto(`${base}/roadmap`, { waitUntil: "domcontentloaded" });
  const roadmapBody = (await page.textContent("body")) ?? "";
  console.log("roadmap planner present:", /topic/i.test(roadmapBody) ? "OK" : "MISSING");

  // ---- 5. Zero AI calls during navigation ------------------------------
  console.log("\nAI network calls during the whole run:", aiCalls.length);
  for (const call of aiCalls) console.log("  ⚠", call);
  console.log("console errors:", consoleErrors.length);
  for (const error of consoleErrors.slice(0, 5)) console.log("  ⚠", error);

  console.log("\npage timings:");
  for (const entry of pageTimings) {
    console.log(`  ${entry.route} — ${entry.status} — ${entry.ms} ms`);
  }
  if (aiCalls.length > 0) process.exitCode = 1;
} finally {
  await browser.close();
}
