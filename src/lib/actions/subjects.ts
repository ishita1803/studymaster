"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { generatePlanForUser } from "@/lib/plan-service";
import { syncSubjectExamDate } from "@/lib/exams";
import { clamp, SUBJECT_COLORS } from "@/lib/utils";

const PREP_LEVELS = ["beginner", "intermediate", "advanced"] as const;

function normalizePrep(value: string) {
  return (PREP_LEVELS as readonly string[]).includes(value) ? value : "intermediate";
}

function refreshStudyViews() {
  revalidatePath("/dashboard");
  revalidatePath("/roadmap");
  revalidatePath("/analytics");
  revalidatePath("/focus");
  revalidatePath("/subjects");
  revalidatePath("/notes");
  revalidatePath("/flashcards");
  revalidatePath("/quizzes");
}

export async function createSubjectAction(formData: FormData) {
  const userId = await requireUserId();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const colorRaw = String(formData.get("color") ?? "mint");
  const color = (SUBJECT_COLORS as readonly string[]).includes(colorRaw) ? colorRaw : "mint";

  // A subject is a study container. It never creates roadmap work on its own;
  // only a dated test with selected topics does that.
  await prisma.subject.create({
    data: {
      userId,
      name: name.slice(0, 60),
      description: String(formData.get("description") ?? "").trim().slice(0, 500),
      color,
      importance: clamp(Number(formData.get("importance") ?? 3), 1, 5),
      difficulty: clamp(Number(formData.get("difficulty") ?? 3), 1, 5),
      prepLevel: normalizePrep(String(formData.get("prepLevel") ?? "intermediate")),
    },
  });

  await generatePlanForUser(userId, { startDate: new Date() });
  refreshStudyViews();
}

export async function updateSubjectAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  const subject = await prisma.subject.findFirst({ where: { id, userId } });
  if (!subject) return;

  await prisma.subject.update({
    where: { id },
    data: {
      name: String(formData.get("name") ?? subject.name).trim().slice(0, 60) || subject.name,
      description: String(formData.get("description") ?? subject.description)
        .trim()
        .slice(0, 500),
      importance: clamp(Number(formData.get("importance") ?? subject.importance), 1, 5),
      difficulty: clamp(Number(formData.get("difficulty") ?? subject.difficulty), 1, 5),
      prepLevel: normalizePrep(String(formData.get("prepLevel") ?? subject.prepLevel)),
    },
  });

  await syncSubjectExamDate(id);
  await generatePlanForUser(userId, { startDate: new Date() });
  refreshStudyViews();
}

export async function deleteSubjectAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  const subject = await prisma.subject.findFirst({ where: { id, userId } });
  if (!subject) return;

  await prisma.$transaction(async (tx) => {
    await tx.planItem.deleteMany({ where: { subjectId: id } });
    // AI generation jobs pointing at the subject would run against nothing.
    await tx.generationJob.deleteMany({ where: { subjectId: id } });
    await tx.examTopic.deleteMany({ where: { exam: { subjectId: id } } });
    await tx.exam.deleteMany({ where: { subjectId: id } });
    await tx.flashcardReview.deleteMany({ where: { card: { subjectId: id } } });
    await tx.flashcard.deleteMany({ where: { subjectId: id } });
    await tx.answer.deleteMany({ where: { question: { quiz: { subjectId: id } } } });
    await tx.question.deleteMany({ where: { quiz: { subjectId: id } } });
    await tx.quizAttempt.deleteMany({ where: { quiz: { subjectId: id } } });
    await tx.quiz.deleteMany({ where: { subjectId: id } });
    await tx.topic.deleteMany({ where: { subjectId: id } });
    await tx.note.deleteMany({ where: { subjectId: id } });
    await tx.extractionReport.deleteMany({ where: { subjectId: id } });
    await tx.subject.deleteMany({ where: { id, userId } });
  });

  await generatePlanForUser(userId, { startDate: new Date() });
  refreshStudyViews();
}

export async function createTopicAction(formData: FormData) {
  const userId = await requireUserId();
  const subjectId = String(formData.get("subjectId") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  const subject = await prisma.subject.findFirst({ where: { id: subjectId, userId } });
  if (!subject || !name) return;

  await prisma.topic.create({
    data: {
      userId,
      subjectId,
      name: name.slice(0, 80),
      difficulty: clamp(Number(formData.get("difficulty") ?? 3), 1, 5),
      importance: clamp(Number(formData.get("importance") ?? 3), 1, 5),
      estimatedMinutes: clamp(Number(formData.get("estimatedMinutes") ?? 60), 15, 600),
    },
  });

  await generatePlanForUser(userId, { startDate: new Date() });
  refreshStudyViews();
}

export async function updateTopicAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  const topic = await prisma.topic.findFirst({ where: { id, userId } });
  if (!topic) return;

  const statusRaw = String(formData.get("status") ?? topic.status);
  const allowed = ["not_started", "in_progress", "studied", "revised", "mastered"];
  const status = allowed.includes(statusRaw) ? statusRaw : topic.status;

  await prisma.topic.update({
    where: { id },
    data: {
      name: String(formData.get("name") ?? topic.name).trim().slice(0, 80) || topic.name,
      difficulty: clamp(Number(formData.get("difficulty") ?? topic.difficulty), 1, 5),
      importance: clamp(Number(formData.get("importance") ?? topic.importance), 1, 5),
      estimatedMinutes: clamp(
        Number(formData.get("estimatedMinutes") ?? topic.estimatedMinutes),
        15,
        600,
      ),
      status,
      masteryScore: status === "mastered" ? Math.max(topic.masteryScore, 90) : topic.masteryScore,
    },
  });

  await generatePlanForUser(userId, { startDate: new Date() });
  refreshStudyViews();
}

export async function deleteTopicAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  await prisma.topic.deleteMany({ where: { id, userId } });
  await generatePlanForUser(userId, { startDate: new Date() });
  refreshStudyViews();
}

/**
 * Removes every topic of a subject (the whole syllabus tree) while keeping
 * the subject itself and its source documents (notes/PDFs). The approved
 * flag is cleared so nothing is scheduled until a new syllabus is approved.
 */
export async function deleteAllTopicsAction(formData: FormData) {
  const userId = await requireUserId();
  const subjectId = String(formData.get("subjectId") ?? "");
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, userId },
    select: { id: true },
  });
  if (!subject) return;

  await prisma.topic.deleteMany({ where: { subjectId, userId } });
  await prisma.subject.update({
    where: { id: subjectId },
    data: { syllabusApproved: false },
  });
  await generatePlanForUser(userId, { startDate: new Date() });
  refreshStudyViews();
}
