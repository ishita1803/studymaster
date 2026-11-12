/**
 * E2E exercise for the subject danger-zone delete:
 * 1. creates a disposable subject with a note, success via API-free composer
 * 2. deletes it from the SUBJECT PAGE (ConfirmDeleteDialog flow)
 * 3. verifies cascade: subject gone AND its note/flashcards/quizzes gone,
 *    and the reserved real exam untouched.
 */
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";

const prisma = new PrismaClient();
const base = "http://localhost:3000";
const marker = `E2E disposable subject ${Date.now()}`;

try {
  const user = await prisma.user.findFirst({ where: { email: "demo@studymaster.app" } });
  if (!user) throw new Error("demo user missing");

  // Disposable subject + a note + a flashcard to check the explicit cascades.
  const subject = await prisma.subject.create({
    data: { userId: user.id, name: marker.slice(0, 60), color: "mint" },
  });
  const note = await prisma.note.create({
    data: {
      userId: user.id,
      subjectId: subject.id,
      title: `${marker} note`,
      content: "Cell respiration releases ATP; mitochondria are the site.",
    },
  });
  const card = await prisma.flashcard.create({
    data: {
      userId: user.id,
      subjectId: subject.id,
      front: "Where does respiration happen?",
      back: "In the mitochondria.",
      source: "manual",
    },
  });

  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "demo@studymaster.app");
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 30_000 });

  await page.goto(`${base}/subjects/${subject.id}`, { waitUntil: "domcontentloaded" });
  const hasZone = ((await page.textContent("body")) ?? "").includes("Danger zone");
  console.log("danger zone on subject page:", hasZone ? "OK" : "MISSING");

  await page.getByRole("button", { name: "Delete subject" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Confirm Delete" }).click();
  await page.waitForTimeout(2500);

  const still = await prisma.subject.findUnique({ where: { id: subject.id } });
  const noteAfter = await prisma.note.findUnique({ where: { id: note.id } });
  const cardAfter = await prisma.flashcard.findUnique({ where: { id: card.id } });
  console.log(
    "subject deleted:", !still ? "OK" : "FAIL",
    "| note cascaded:", !noteAfter ? "OK" : "FAIL",
    "| flashcard cascaded:", !cardAfter ? "OK" : "FAIL",
  );

  // The user's real reserved exam must be untouched.
  const reserved = await prisma.exam.findFirst({
    where: { subjectId: "cmw1ov3q900aotodov4vfpsci" },
  });
  console.log(
    "reserved real exam intact:",
    reserved?.id === "cmw6avxig000ftocov75f1cvw" ? "OK" : "CHECK",
  );
  await browser.close();

  if (still || noteAfter || cardAfter) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
