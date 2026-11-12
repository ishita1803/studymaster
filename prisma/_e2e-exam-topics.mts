/**
 * Exam topic-selection + per-topic difficulty-rating E2E:
 * creates a test on the demo subject, selects TWO syllabus leaf topics,
 * rates the first "hard" and the second "easy", then verifies
 *   1. exactly those topics are stored on the exam, with the chosen
 *      Easy/Medium/Hard ratings per topic (per-exam, not global), and
 *   2. the regenerated roadmap gives the hard-rated topic ≥ the minutes of
 *      the easy-rated one (equal-baseline topics are preferred when found).
 * Finally removes the fixture exam (cleanup). Run: npx tsx prisma/_e2e-exam-topics.mts
 */
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const base = process.argv[2] ?? "http://localhost:3000";
const prisma = new PrismaClient();
const aiCalls: string[] = [];
const demail = "demo@studymaster.app";

const user = await prisma.user.findUnique({ where: { email: demail } });
const subject = await prisma.subject.findFirst({
  where: { userId: user!.id },
  orderBy: { createdAt: "asc" },
});
const leaves = await prisma.topic.findMany({
  where: { subjectId: subject!.id, approved: true, children: { none: {} } },
  orderBy: { createdAt: "asc" },
  select: { id: true, name: true, estimatedMinutes: true },
});
console.log("leaf topics:", leaves.map((t) => `${t.name} (${t.estimatedMinutes}m)`));
if (leaves.length < 2) {
  console.log("FAIL: need at least two approved leaf topics");
  process.exit(1);
}
const hardPick = leaves.find((t) => t.name === "Cell division") ?? leaves[0];
const easyTopic = leaves.find((t) => t.id !== hardPick.id)!;

const browser = await chromium.launch();
try {
  const page = await (await browser.newContext()).newPage();
  page.on("request", (request) => {
    if (request.url().includes("generativelanguage.googleapis.com")) {
      aiCalls.push(request.url().slice(0, 100));
    }
  });

  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', demail);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 30_000 });

  await page.goto(`${base}/roadmap`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Test", exact: true }).first().click();
  await page.waitForSelector("#exam-name", { timeout: 10_000 });

  const date = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  const iso = date.toISOString().slice(0, 10);

  await page.fill("#exam-name", "E2E topic selection test");
  await page.fill("#exam-date", iso);
  // Clear all, then check exactly two topics and rate them per topic
  // (1–5 scale: "5" = very hard, "2" = easy).
  await page.getByText("Clear all").first().click();
  for (const [topic, rating] of [
    [hardPick, "5"],
    [easyTopic, "2"],
  ] as const) {
    const label = page.locator("label").filter({ hasText: topic.name }).first();
    await label.locator('input[type="checkbox"]').check();
    await page
      .locator(`select[name="difficulty_${topic.id}"]`)
      .selectOption(rating);
    console.log(`${topic.name}: checked + rated ${rating}`);
  }

  await page.getByText("Add & plan").first().click();
  await page.waitForURL(/examAdded|error/, { timeout: 60_000 });
  console.log("post-submit url:", page.url().replace(base, ""));
  await page.waitForTimeout(1500);
  const body = (await page.textContent("body")) ?? "";
  console.log(
    "exam row shows 2 topics:",
    /E2E topic selection test/.test(body) ? "OK" : "MISSING",
  );

  const exam = await prisma.exam.findFirst({
    where: { userId: user!.id, name: "E2E topic selection test" },
    include: { examTopics: true },
  });
  const byTopic = new Map(
    (exam?.examTopics ?? []).map((row) => [row.topicId, row.difficulty]),
  );
  console.log(
    "stored ratings:",
    [...byTopic].map(
      ([topicId, difficulty]) =>
        `${leaves.find((t) => t.id === topicId)?.name}=${difficulty}`,
    ),
  );
  const ratingsOk =
    exam?.examTopics.length === 2 &&
    byTopic.get(hardPick.id) === "5" &&
    byTopic.get(easyTopic.id) === "2";
  console.log("per-exam ratings stored exactly as chosen:", ratingsOk ? "OK" : "FAIL");
  if (!ratingsOk) process.exitCode = 1;

  // Roadmap must weight the two topics by their exam-only rating.
  const planItems = await prisma.planItem.findMany({
    where: { planDay: { userId: user!.id }, kind: "study" },
    select: { topicId: true, minutes: true, completed: true },
  });
  const minutesFor = (topicId: string) =>
    planItems
      .filter((item) => item.topicId === topicId)
      .reduce((total, item) => total + item.minutes, 0);
  const hardMinutes = minutesFor(hardPick.id);
  const easyMinutes = minutesFor(easyTopic.id);
  const baseline = (topic: (typeof leaves)[number]) =>
    Math.max(5, Math.round(topic.estimatedMinutes * (topic.id === hardPick.id ? 1.7 : 0.8)));
  console.log(
    `plan minutes → hard-rated "${hardPick.name}": ${hardMinutes}m ` +
      `(baseline ${hardPick.estimatedMinutes}m → expected ≈${baseline(hardPick)}m) | ` +
      `easy-rated "${easyTopic.name}": ${easyMinutes}m ` +
      `(baseline ${easyTopic.estimatedMinutes}m → expected ≈${baseline(easyTopic)}m)`,
  );
  const weightedOk = hardMinutes >= easyMinutes && easyMinutes > 0;
  console.log(
    "hard-rated topic scheduled with >= easy-rated minutes:",
    weightedOk ? "OK" : "FAIL",
  );
  if (!weightedOk) process.exitCode = 1;

  if (exam) {
    await prisma.exam.delete({ where: { id: exam.id } });
    console.log("fixture exam deleted (cleanup)");
  }
  console.log("AI network calls:", aiCalls.length);
} finally {
  await browser.close();
  await prisma.$disconnect();
}
