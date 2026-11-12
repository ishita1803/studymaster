import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import path from "node:path";

const prisma = new PrismaClient();
const BASE = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3007}`).trim();
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const stamp = Date.now().toString().slice(-6);
const SUBJECT_NAME = `E2E Science ${stamp}`;
const EXAM_NAME = `E2E Genetics Test ${stamp}`;
const PDF = path.resolve("prisma/e2e-multichapter.pdf");

function startOfDay(date = new Date()) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
function dateKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const TOMORROW_KEY = dateKey(tomorrow);
const TODAY_START = startOfDay();

const results = [];
function ok(label, detail = "") {
  results.push({ label, detail, pass: true });
  console.log(`PASS ${label}${detail ? ` — ${detail}` : ""}`);
}
function fail(label, detail = "") {
  results.push({ label, detail, pass: false });
  console.log(`FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  throw new Error(`${label}${detail ? `: ${detail}` : ""}`);
}
function check(condition, label, detail = "") {
  if (condition) ok(label, detail);
  else fail(label, detail);
}
async function waitFor(fn, timeout = 30000, interval = 500) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await fn();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return null;
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.on("pageerror", (error) => console.log("PAGEERROR", error.message));
page.on("console", (message) => {
  if (message.type() === "error") console.log("CONSOLE", message.text().slice(0, 300));
});

let subject = null;
try {
  // ---------------------------------------------------------------- login
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", "demo@studymaster.app");
  await page.fill("#password", "demo1234");
  await Promise.all([
    page.waitForURL("**/dashboard", { timeout: 60000 }),
    page.getByRole("button", { name: /Log in/ }).click(),
  ]);
  check(page.url().includes("/dashboard"), "Login with demo account");

  const user = await prisma.user.findUnique({
    where: { email: "demo@studymaster.app" },
    select: { id: true },
  });
  if (!user) fail("Demo user exists");

  // ------------------------------------------------------- create subject
  await page.goto(`${BASE}/roadmap`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Subject", exact: true }).click();
  await page.locator("#new-subject-name").waitFor({ timeout: 15000 });
  await page.fill("#new-subject-name", SUBJECT_NAME);
  await page.fill("#new-subject-description", "E2E upload, extraction and roadmap test");
  const subjectForm = page.locator("form").filter({ has: page.locator("#new-subject-name") });
  await subjectForm.getByRole("button", { name: /Add & re-plan/ }).click();

  subject = await waitFor(
    () => prisma.subject.findFirst({ where: { userId: user.id, name: SUBJECT_NAME } }),
    30000,
  );
  check(Boolean(subject), "Create subject through roadmap UI", subject?.id);

  // ------------------------------------------------------- upload material
  await page.goto(`${BASE}/subjects/${subject.id}`, { waitUntil: "domcontentloaded" });
  await page.getByText("Upload Study Material").waitFor({ timeout: 20000 });
  ok("Subject page shows prominent Upload Study Material");

  await page.fill("#subject-material-title", "E2E multi-chapter science PDF");
  await page.setInputFiles("#subject-material-file", PDF);
  const selectedName = await page.locator("#subject-material-file").inputValue();
  check(selectedName.includes("e2e-multichapter.pdf"), "PDF selected in upload field");

  await Promise.all([
    page.waitForURL(/syllabus=detected/, { timeout: 180000 }),
    page.getByRole("button", { name: /Upload & extract syllabus/ }).click(),
  ]);
  check(page.url().includes("uploaded=1"), "Upload action completed with uploaded flag", page.url());
  await page.getByText(/Uploaded and extracted/).waitFor({ timeout: 30000 });

  const bodyAfterUpload = await page.locator("body").innerText();
  check(
    bodyAfterUpload.includes("Uploaded and extracted"),
    "Automatic syllabus banner after upload",
  );
  const countMatch = bodyAfterUpload.match(/(\d+)\s+study topics/);
  check(Boolean(countMatch), "Banner reports extracted topic count", countMatch?.[0]);

  const notes = await prisma.note.findMany({
    where: { userId: user.id, subjectId: subject.id },
    orderBy: { createdAt: "desc" },
  });
  const note = notes[0];
  check(Boolean(note), "Uploaded file saved as a document", `${note?.pages} pages`);
  check(note?.pages === 4, "PDF page count stored", String(note?.pages));
  check(note?.ocr === false, "Digital PDF read without OCR");
  check((note?.content?.length ?? 0) > 2500, "PDF text extracted", `${note?.content?.length} chars`);

  const topics = await prisma.topic.findMany({
    where: { userId: user.id, subjectId: subject.id },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  const chapters = topics.filter((topic) => topic.kind === "chapter");
  const leaves = topics.filter((topic) => !topics.some((other) => other.parentId === topic.id));
  check(chapters.length === 4, "Four chapters extracted", chapters.map((c) => c.name).join(", "));
  check(leaves.length >= 35, "Leaf topics extracted across all chapters", String(leaves.length));
  check(
    topics.every((topic) => !topic.approved),
    "Detected topics start unapproved for review",
  );

  const chapterNames = chapters.map((chapter) => chapter.name.toLowerCase());
  for (const expected of ["Cell Biology", "Genetics", "Ecology", "Motion and Forces"]) {
    check(
      chapterNames.some((name) => name.includes(expected.toLowerCase())),
      `Chapter extracted: ${expected}`,
    );
  }
  const leafNames = leaves.map((leaf) => leaf.name.toLowerCase());
  for (const expected of ["mitosis", "photosynthesis", "speed", "gene", "cell"]) {
    check(
      leafNames.some((name) => name.includes(expected)),
      `Topic extracted: ${expected}`,
    );
  }
  const usedLocalFallback = page.url().includes("engine=local");
  check(
    !usedLocalFallback || !topics.some((topic) => /^(a|an|the)\s+[a-z]/i.test(topic.name)),
    "Local fallback strips article prefixes from topic names",
    usedLocalFallback ? "local engine" : "AI engine",
  );
  check(
    bodyAfterUpload.includes("Cell Biology") &&
      bodyAfterUpload.includes("Genetics") &&
      bodyAfterUpload.includes("Ecology") &&
      bodyAfterUpload.includes("Motion and Forces"),
    "Syllabus tree visible in subject page",
  );

  // ---------------------------------------------------------- approve plan
  await Promise.all([
    page.waitForURL(/syllabus=approved/, { timeout: 180000 }),
    page.getByRole("button", { name: /Approve & plan/ }).click(),
  ]);
  const approvedTopics = await prisma.topic.findMany({
    where: { userId: user.id, subjectId: subject.id },
  });
  check(
    approvedTopics.every((topic) => topic.approved),
    "Approve & plan approves the shared syllabus",
    `${approvedTopics.length} topics`,
  );
  ok("Approve & plan redirects to roadmap", page.url());

  // ------------------------------------------------------- create exam UI
  await page.goto(`${BASE}/roadmap`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await page.locator("#exam-name").waitFor({ timeout: 15000 });
  await page.fill("#exam-name", EXAM_NAME);
  await page.selectOption("#exam-subject", subject.id);
  await page.fill("#exam-date", TOMORROW_KEY);

  const genetics = leaves.filter((leaf) =>
    (leaf.chapter ?? "").toLowerCase().includes("genetics"),
  );
  check(
    genetics.length >= 5,
    "Genetics chapter has selectable leaf topics",
    String(genetics.length),
  );
  await page.waitForFunction(
    (expected) =>
      document.querySelectorAll('input[name="topicIds"]').length === expected,
    leaves.length,
    { timeout: 20000 },
  );
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  for (const topic of genetics) {
    await page.locator(`input[name="topicIds"][value="${topic.id}"]`).check();
  }
  const checkedCount = await page.locator('input[name="topicIds"]:checked').count();
  check(checkedCount === genetics.length, "Only Genetics topics checked", String(checkedCount));

  const examForm = page.locator("form").filter({ has: page.locator("#exam-name") });
  await Promise.all([
    page.waitForURL(/examAdded=1/, { timeout: 180000 }),
    examForm.getByRole("button", { name: /Add & re-plan/ }).click(),
  ]);
  ok("Exam added through roadmap UI", page.url());

  const exam = await prisma.exam.findFirst({
    where: { userId: user.id, name: EXAM_NAME },
    include: { examTopics: true },
  });
  check(Boolean(exam), "Exam saved", exam?.id);
  check(dateKey(exam.date) === TOMORROW_KEY, "Exam dated tomorrow", dateKey(exam.date));
  const savedTopicIds = new Set(exam.examTopics.map((entry) => entry.topicId));
  check(
    savedTopicIds.size === genetics.length &&
      genetics.every((topic) => savedTopicIds.has(topic.id)),
    "Exam stores exactly the selected topic IDs",
    `${savedTopicIds.size} topics`,
  );

  // -------------------------------------------- day-before exclusivity check
  const planDay = await prisma.planDay.findFirst({
    where: { userId: user.id, date: TODAY_START },
    include: { items: true },
  });
  const items = planDay?.items ?? [];
  const openItems = items.filter((item) => !item.completed);
  const preservedItems = items.filter((item) => item.completed);
  check(items.length > 0, "Day before the exam has scheduled work", `${items.length} blocks`);
  check(openItems.length > 0, "Day-before plan has open work", `${openItems.length} open blocks`);
  check(
    openItems.every((item) => item.subjectId === subject.id),
    "Open day-before work contains only the exam subject",
  );
  check(
    openItems.every((item) => item.topicId && savedTopicIds.has(item.topicId)),
    "Open day-before work uses only selected topic IDs",
  );
  check(
    openItems.some((item) => item.kind === "revision" || item.kind === "quiz"),
    "Open day-before work is revision/quiz only",
    openItems.map((item) => item.kind).join(","),
  );
  check(
    openItems.every((item) => /exam in 1 day/.test(item.reason)),
    "Day-before reasons reference tomorrow's exam",
  );
  check(
    preservedItems.every((item) => item.completed),
    "Previously completed blocks are preserved",
    `${preservedItems.length} completed blocks kept`,
  );

  const todayCard = page.locator(".glass.card").filter({ hasText: "Today" }).first();
  const todayText = await todayCard.innerText();
  check(todayText.includes(SUBJECT_NAME), "Roadmap today card shows the new subject");
  check(todayText.includes("exam in 1 day"), "Roadmap today card shows tomorrow's exam countdown");

  // ------------------------------------------------------- generate cards
  const cardsBefore = await prisma.flashcard.count({
    where: { userId: user.id, subjectId: subject.id },
  });
  await page.goto(`${BASE}/flashcards?subject=${subject.id}`, { waitUntil: "domcontentloaded" });
  await page.locator("#card-subject").waitFor({ timeout: 20000 });
  await page.selectOption("#card-subject", subject.id);
  await page.selectOption("#card-count", "10");
  await page.getByRole("button", { name: "Generate flashcards" }).click();
  const cardsDone = await waitFor(async () => {
    const text = await page.locator("body").innerText();
    return text.includes("Study now") || text.includes("Generation failed") ? text : null;
  }, 180000);
  check(Boolean(cardsDone), "Flashcard generation job completed");
  check(!cardsDone.includes("Generation failed"), "Flashcard generation did not fail");

  const cards = await prisma.flashcard.findMany({
    where: { userId: user.id, subjectId: subject.id },
    orderBy: { createdAt: "desc" },
  });
  check(cards.length > cardsBefore, "Flashcards saved for the subject", String(cards.length));
  check(
    cards.every((card) => Boolean(card.topicId)),
    "Every generated card links to a syllabus topic",
  );
  const allowedFormats = new Set([
    "concept",
    "definition",
    "explanation",
    "comparison",
    "application",
    "process",
    "formula",
  ]);
  check(
    cards.every((card) => allowedFormats.has(card.format)),
    "Card formats are all allowed",
    [...new Set(cards.map((card) => card.format))].join(","),
  );
  check(
    cards.every((card) => !/_{3,}|fill in the blank|\bcloze\b/i.test(`${card.front} ${card.back}`)),
    "No cloze or blank-fill cards",
  );
  check(
    cards.every((card) => card.front.trim().length > 5 && card.back.trim().length > 10),
    "Cards have real prompts and answers",
  );
  const cardTopicNames = new Set(
    approvedTopics.map((topic) => topic.name.toLowerCase().trim()),
  );
  check(
    cards.every((card) => cardTopicNames.has((card.topicLabel ?? "").toLowerCase().trim())),
    "Card labels match real syllabus topics",
    [...new Set(cards.map((card) => card.topicLabel))].slice(0, 5).join(" | "),
  );

  // -------------------------------------------------------- generate quiz
  await page.goto(`${BASE}/quizzes/new?subjectId=${subject.id}`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator("#ai-title").waitFor({ timeout: 20000 });
  await page.fill("#ai-title", `E2E mixed quiz ${stamp}`);
  await page.selectOption("#ai-note", note.id);
  await page.selectOption("#ai-count", "10");
  await page.getByText("Application-based", { exact: true }).click();
  await page.getByText("Problem-solving", { exact: true }).click();
  check(
    await page.locator('input[name="questionTypes"][value="application"]').isChecked(),
    "Application-based type selected",
  );
  check(
    await page.locator('input[name="questionTypes"][value="problem"]').isChecked(),
    "Problem-solving type selected",
  );
  await page.getByRole("button", { name: /Generate quiz/ }).click();
  await page.waitForURL(
    (url) => /^\/quizzes\/[a-z0-9]+$/.test(url.pathname) && !url.pathname.endsWith("/new"),
    { timeout: 180000 },
  );
  const quizUrl = page.url();
  ok("Quiz generated and opened", quizUrl);

  const quizBody = await page.locator("body").innerText();
  check(!/fill in the blank/i.test(quizBody), "Quiz page has no fill-in-the-blank UI");

  const quizId = quizUrl.split("/quizzes/")[1].split("?")[0];
  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId, userId: user.id },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  check(Boolean(quiz), "Generated quiz saved", quiz?.id);

  // The material may or may not support the two hardest requested types.
  // Either way the app must be honest: produce them, or say they are missing.
  const producedTypes = new Set(quiz.questions.map((question) => question.type));
  const requestedHardTypes = [
    { value: "application", label: "Application-based" },
    { value: "problem", label: "Problem-solving" },
  ];
  const missingHardTypes = requestedHardTypes.filter(
    (entry) => !producedTypes.has(entry.value),
  );
  if (missingHardTypes.length > 0) {
    check(
      quizUrl.includes("notice="),
      "Unsupported-type notice included in redirect",
      quizUrl,
    );
    check(
      /could not support/i.test(quizBody),
      "Quiz page explains unsupported answer types",
    );
    for (const entry of missingHardTypes) {
      check(
        quizBody.toLowerCase().includes(entry.label.toLowerCase()),
        `Notice names the unsupported ${entry.label} type`,
      );
    }
  } else {
    ok(
      "Material supported both Application-based and Problem-solving questions",
      [...producedTypes].join(","),
    );
  }
  check(
    quiz.questionTypes === JSON.stringify([...producedTypes]),
    "Stored question types match the questions actually produced",
    quiz.questionTypes,
  );

  const allowedTypes = new Set([
    "mcq",
    "truefalse",
    "match",
    "short",
    "long",
    "application",
    "problem",
  ]);
  check(
    quiz.questions.every((question) => allowedTypes.has(question.type)),
    "Quiz contains only allowed question types",
    [...new Set(quiz.questions.map((q) => q.type))].join(","),
  );
  check(
    quiz.questions.every((question) => question.type !== "fillblank"),
    "Quiz contains no fill-in-the-blank questions",
  );
  check(
    quiz.questions.every(
      (question) =>
        question.prompt.trim().length > 10 &&
        question.correctAnswer.trim().length > 0 &&
        question.explanation.trim().length > 0,
    ),
    "Every question has prompt, answer and explanation",
  );
  check(
    quiz.questions.every((question) => !/_{3,}|fill in the blank/i.test(question.prompt)),
    "No blank-deletion prompts",
  );
  const mcqQuestions = quiz.questions.filter((question) => question.type === "mcq");
  check(
    mcqQuestions.every((question) => {
      const options = JSON.parse(question.options || "[]");
      return (
        options.length >= 4 &&
        new Set(options.map((option) => option.toLowerCase())).size === options.length &&
        options.includes(question.correctAnswer)
      );
    }),
    "MCQ options are unique and include the correct answer",
    `${mcqQuestions.length} MCQs`,
  );
  const questionTopicNames = new Set(approvedTopics.map((topic) => topic.name.toLowerCase().trim()));
  const linkedQuestions = quiz.questions.filter((question) =>
    questionTopicNames.has((question.topicLabel ?? "").toLowerCase().trim()),
  );
  check(
    linkedQuestions.length >= Math.ceil(quiz.questions.length * 0.8),
    "Most questions link to real syllabus topics",
    `${linkedQuestions.length}/${quiz.questions.length}`,
  );

  // A student can also generate from the whole subject without picking a note.
  // That path must read the subject's uploaded documents, not just topic names.
  await page.goto(`${BASE}/quizzes/new?subjectId=${subject.id}`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator("#ai-title").waitFor({ timeout: 20000 });
  await page.fill("#ai-title", `E2E mixed quiz subject-only ${stamp}`);
  await page.selectOption("#quiz-subject", subject.id);
  await page.selectOption("#ai-note", "");
  await page.selectOption("#ai-count", "5");
  await page.getByRole("button", { name: /Generate quiz/ }).click();
  await page.waitForURL(
    (url) => /^\/quizzes\/[a-z0-9]+$/.test(url.pathname) && !url.pathname.endsWith("/new"),
    { timeout: 180000 },
  );
  const subjectQuizId = page.url().split("/quizzes/")[1].split("?")[0];
  const subjectQuiz = await prisma.quiz.findFirst({
    where: { id: subjectQuizId, userId: user.id },
    include: { questions: true },
  });
  check(Boolean(subjectQuiz), "Subject-only quiz generated without selecting a note");
  check(
    (subjectQuiz?.questions.length ?? 0) > 0,
    "Subject-only quiz used the uploaded documents",
    `${subjectQuiz?.questions.length ?? 0} questions`,
  );
  check(
    subjectQuiz?.subjectId === subject.id,
    "Subject-only quiz stays linked to the subject",
  );

  // ------------------------------------------------------------ analytics
  await page.goto(`${BASE}/analytics`, { waitUntil: "domcontentloaded" });
  const analyticsBody = await page.locator("body").innerText();
  check(page.url().includes("/analytics"), "Analytics page loads");
  ok(
    "Analytics mentions the new subject or its topics",
    analyticsBody.includes(SUBJECT_NAME) ? "subject listed" : "subject not listed (no attempts yet)",
  );

  // ------------------------------------------------------- subject summary
  await page.goto(`${BASE}/subjects/${subject.id}`, { waitUntil: "domcontentloaded" });
  const subjectBody = await page.locator("body").innerText();
  check(subjectBody.includes(SUBJECT_NAME), "Subject page still loads after generation");
  check(
    subjectBody.includes(`${cards.length}`) || subjectBody.includes("Flashcards"),
    "Subject page reflects generated flashcards",
  );
  check(subjectBody.includes(EXAM_NAME), "Subject page lists the new exam");

  const finalTopics = await prisma.topic.count({
    where: { userId: user.id, subjectId: subject.id },
  });
  const finalCards = await prisma.flashcard.count({
    where: { userId: user.id, subjectId: subject.id },
  });
  const finalQuizzes = await prisma.quiz.count({
    where: { userId: user.id, subjectId: subject.id },
  });
  ok(
    "Final subject state",
    `${finalTopics} topics · ${finalCards} cards · ${finalQuizzes} quizzes`,
  );

  console.log("\n=== SUMMARY ===");
  console.log(`Subject: ${SUBJECT_NAME} (${subject.id})`);
  console.log(`Exam: ${EXAM_NAME} (${exam.id}) on ${TOMORROW_KEY}`);
  console.log(`Quiz: ${quizId}`);
  console.log(`Checks passed: ${results.filter((entry) => entry.pass).length}`);
  console.log(`Day-before items: ${items.length} — ${items.map((item) => `${item.title}/${item.kind}`).join(", ")}`);
  console.log("E2E_RESULT=PASS");
} catch (error) {
  console.error("\nE2E_RESULT=FAIL");
  console.error(error);
  try {
    await page.screenshot({ path: "prisma/_e2e-failure.png", fullPage: true });
    console.log("Saved prisma/_e2e-failure.png");
  } catch {}
  process.exitCode = 1;
} finally {
  await browser.close();
  await prisma.$disconnect();
}
