"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { generatePlanForUser } from "@/lib/plan-service";
import { syncSubjectExamDate } from "@/lib/exams";
import { clamp, startOfDay } from "@/lib/utils";

function refresh() {
  revalidatePath("/roadmap");
  revalidatePath("/dashboard");
  revalidatePath("/analytics");
  revalidatePath("/settings");
}

function parseExamDate(raw: string) {
  const value = raw.trim();
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (startOfDay(date) < startOfDay()) return null;
  return date;
}

const PREP_LEVELS = ["beginner", "intermediate", "advanced"] as const;

function normalizePrep(value: string) {
  return (PREP_LEVELS as readonly string[]).includes(value) ? value : "intermediate";
}

function fail(message: string): never {
  redirect(`/roadmap?examError=${encodeURIComponent(message)}`);
}

const TOPIC_RATINGS = ["1", "2", "3", "4", "5"] as const;

export type TopicRating = (typeof TOPIC_RATINGS)[number];

/**
 * Ratings arrive as "1".."5" from the planner select. Legacy forms may send
 * the old Easy/Medium/Hard words (mapped to 2/3/4); anything else is "3".
 */
function normalizeRating(value: FormDataEntryValue | null): TopicRating {
  const raw = String(value ?? "").trim().toLowerCase();
  if ((TOPIC_RATINGS as readonly string[]).includes(raw)) return raw as TopicRating;
  if (raw === "easy") return "2";
  if (raw === "hard") return "4";
  return "3";
}

/**
 * Reads the topic checkboxes for an exam, plus each selected topic's
 * 1–5 rating sent as `difficulty_<topicId>`.
 *
 * Returns `null` when the form did not include the picker at all (legacy
 * callers such as onboarding), which means "this test covers the whole subject".
 * When the picker is present, every selected chapter is expanded to its leaf
 * topics because only leaves are scheduled, and at least one topic is required.
 */
async function resolveSelectedTopicIds(
  userId: string,
  subjectId: string,
  formData: FormData,
): Promise<{ topicId: string; rating: TopicRating }[] | null> {
  if (String(formData.get("topicSelection") ?? "") !== "1") return null;

  const raw = formData.getAll("topicIds").map(String).filter(Boolean);
  const topics = await prisma.topic.findMany({
    where: { userId, subjectId, approved: true },
    select: { id: true, parentId: true },
  });

  const childrenOf = new Map<string, string[]>();
  for (const topic of topics) {
    if (!topic.parentId) continue;
    const list = childrenOf.get(topic.parentId) ?? [];
    list.push(topic.id);
    childrenOf.set(topic.parentId, list);
  }

  const known = new Set(topics.map((topic) => topic.id));
  const leaves = new Set<string>();
  const addLeaves = (id: string) => {
    if (leaves.has(id)) return;
    const children = childrenOf.get(id) ?? [];
    if (children.length === 0) {
      leaves.add(id);
      return;
    }
    for (const child of children) addLeaves(child);
  };

  for (const id of raw) {
    if (known.has(id)) addLeaves(id);
  }

  if (leaves.size === 0) {
    fail("Select at least one approved topic for this test.");
  }

  // The rating chosen on a leaf topic travels directly; a rating on a chapter
  // applies to every leaf topic that was expanded from it.
  const ratings = new Map<string, TopicRating>();
  for (const id of raw) {
    if (!known.has(id)) continue;
    const rating = normalizeRating(
      formData.get(`difficulty_${id}`) ?? formData.get(`rating_${id}`),
    );
    const children = childrenOf.get(id) ?? [];
    if (children.length === 0) {
      ratings.set(id, rating);
    } else {
      // Only count chapter ratings for leaves that really came from it.
      for (const child of children) {
        if (leaves.has(child) && !ratings.has(child)) ratings.set(child, rating);
      }
    }
  }

  return [...leaves].map((topicId) => ({
    topicId,
    rating: ratings.get(topicId) ?? ("3" as TopicRating),
  }));
}

export async function createExamAction(formData: FormData) {
  const userId = await requireUserId();
  const subjectId = String(formData.get("subjectId") ?? "");
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, userId },
    select: { id: true, name: true },
  });
  if (!subject) fail("Pick a subject for this test.");

  const date = parseExamDate(String(formData.get("date") ?? ""));
  if (!date) fail("Choose today or a future date for the test.");

  const name =
    String(formData.get("name") ?? "").trim().slice(0, 80) ||
    `${subject.name} test`;

  const topicIds = await resolveSelectedTopicIds(userId, subject.id, formData);

  await prisma.exam.create({
    data: {
      userId,
      subjectId: subject.id,
      name,
      date,
      importance: clamp(Number(formData.get("importance") ?? 3), 1, 5),
      difficulty: clamp(Number(formData.get("difficulty") ?? 3), 1, 5),
      prepLevel: normalizePrep(String(formData.get("prepLevel") ?? "intermediate")),
      material: String(formData.get("material") ?? "").trim().slice(0, 300),
      examTopics: topicIds
        ? { create: topicIds.map((entry) => ({ topicId: entry.topicId, difficulty: entry.rating })) }
        : undefined,
    },
  });

  await syncSubjectExamDate(subject.id);
  await generatePlanForUser(userId, { startDate: new Date() });
  refresh();
  redirect("/roadmap?examAdded=1");
}

export async function updateExamAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  const exam = await prisma.exam.findFirst({ where: { id, userId } });
  if (!exam) fail("That test could not be found.");

  const dateRaw = String(formData.get("date") ?? "").trim();
  const date = dateRaw ? parseExamDate(dateRaw) : exam.date;
  if (!date) fail("Choose today or a future date for the test.");

  const name = String(formData.get("name") ?? "").trim().slice(0, 80) || exam.name;
  const topicIds = await resolveSelectedTopicIds(userId, exam.subjectId, formData);

  await prisma.exam.update({
    where: { id: exam.id },
    data: {
      name,
      date,
      importance: clamp(Number(formData.get("importance") ?? exam.importance), 1, 5),
      difficulty: clamp(Number(formData.get("difficulty") ?? exam.difficulty), 1, 5),
      prepLevel: normalizePrep(String(formData.get("prepLevel") ?? exam.prepLevel)),
      material: String(formData.get("material") ?? exam.material).trim().slice(0, 300),
    },
  });

  if (topicIds) {
    await prisma.$transaction([
      prisma.examTopic.deleteMany({ where: { examId: exam.id } }),
      prisma.examTopic.createMany({
        data: topicIds.map((entry) => ({
          examId: exam.id,
          topicId: entry.topicId,
          difficulty: entry.rating,
        })),
      }),
    ]);
  }

  await syncSubjectExamDate(exam.subjectId);
  await generatePlanForUser(userId, { startDate: new Date() });
  refresh();
  redirect("/roadmap?examSaved=1");
}

export async function deleteExamAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  const exam = await prisma.exam.findFirst({ where: { id, userId } });
  if (!exam) return;

  await prisma.exam.delete({ where: { id: exam.id } });
  await syncSubjectExamDate(exam.subjectId);
  await generatePlanForUser(userId, { startDate: new Date() });
  refresh();
  redirect("/roadmap?examDeleted=1");
}
