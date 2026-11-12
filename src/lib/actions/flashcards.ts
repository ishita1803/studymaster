"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { makeFlashcards } from "@/lib/ai/study-tools";
import { InsufficientMaterialError } from "@/lib/ai/content-study";
import { runFlashcardJob } from "@/lib/ai/flashcard-jobs";
import { scheduleCard, type Rating } from "@/lib/srs";
import { getWeakTopics } from "@/lib/analytics";
import { awardXp, evaluateAchievements, XP_RULES } from "@/lib/gamification";
import { readUploadedText } from "@/lib/files/extract";
import { matchTopicIdFromText } from "@/lib/topic-feedback";
import { loadSubjectDocuments } from "@/lib/subject-documents";
import { clamp } from "@/lib/utils";

async function resolveCardSource(
  userId: string,
  formData: FormData,
): Promise<{
  source: string;
  noteId: string | null;
  subjectId: string | null;
  topicId: string | null;
  context: string;
  materialLength: number;
  error?: string;
  ocr?: boolean;
  pages?: number;
  skippedPages?: number;
}> {
  const noteId = String(formData.get("noteId") ?? "") || null;
  const subjectIdRaw = String(formData.get("subjectId") ?? "") || null;
  const topicIdRaw = String(formData.get("topicId") ?? "") || null;
  const upload = await readUploadedText(formData);
  if (upload.error) {
    return {
      source: "",
      noteId,
      subjectId: null,
      topicId: null,
      context: "",
      materialLength: 0,
      error: upload.error,
    };
  }

  const pasted = [String(formData.get("source") ?? "").trim(), upload.text]
    .filter(Boolean)
    .join("\n\n");

  let source = pasted;
  let context = "";
  let subjectId: string | null = null;
  let topicId: string | null = null;
  let materialLength = pasted.trim().length;

  if (noteId) {
    const note = await prisma.note.findFirst({
      where: { id: noteId, userId },
      include: { subject: { select: { id: true, name: true } } },
    });
    if (note) {
      source = [note.title, note.content, pasted].filter(Boolean).join("\n\n");
      context = note.title;
      subjectId = note.subjectId;
      materialLength += note.content.trim().length;
    }
  }

  if (topicIdRaw) {
    const topic = await prisma.topic.findFirst({
      where: { id: topicIdRaw, userId },
      include: { subject: { select: { id: true, name: true } } },
    });
    if (topic) {
      topicId = topic.id;
      subjectId = topic.subjectId;
      context = `${topic.subject.name} · ${topic.name}`;
      if (!source) {
        // A topic name alone is not study material. Fall back to the subject's
        // uploaded documents so cards stay grounded in real content.
        const documents = await loadSubjectDocuments(userId, topic.subjectId);
        source = documents.text || `${topic.subject.name} — ${topic.name}`;
        materialLength += documents.length;
      }
    }
  } else if (subjectIdRaw) {
    const subject = await prisma.subject.findFirst({
      where: { id: subjectIdRaw, userId },
      include: { topics: { where: { approved: true }, select: { name: true } } },
    });
    if (subject) {
      subjectId = subject.id;
      context = subject.name;
      if (!source) {
        // Generating for a whole subject must read the subject's uploaded
        // material, not just its topic names. Topic names contain no
        // definitions, so the old behaviour produced "no usable cards".
        const documents = await loadSubjectDocuments(userId, subject.id);
        source =
          documents.text ||
          `${subject.name}: ${subject.topics.map((topic) => topic.name).join(", ")}`;
        materialLength += documents.length;
      }
    }
  }

  return {
    source,
    noteId,
    subjectId,
    topicId,
    context,
    materialLength,
    ocr: upload.ocr,
    pages: upload.pages,
    skippedPages: upload.skippedPages,
  };
}

export async function createCardAction(formData: FormData) {
  const userId = await requireUserId();
  const front = String(formData.get("front") ?? "").trim();
  const back = String(formData.get("back") ?? "").trim();
  if (!front || !back) return;

  const subjectIdRaw = String(formData.get("subjectId") ?? "") || null;
  const topicIdRaw = String(formData.get("topicId") ?? "") || null;

  let subjectId: string | null = null;
  let topicId: string | null = null;

  if (subjectIdRaw) {
    const subject = await prisma.subject.findFirst({ where: { id: subjectIdRaw, userId } });
    if (subject) subjectId = subject.id;
  }
  if (topicIdRaw) {
    const topic = await prisma.topic.findFirst({ where: { id: topicIdRaw, userId } });
    if (topic) {
      topicId = topic.id;
      subjectId = topic.subjectId;
    }
  }

  await prisma.flashcard.create({
    data: {
      userId,
      front: front.slice(0, 600),
      back: back.slice(0, 1200),
      subjectId,
      topicId,
      dueAt: new Date(),
    },
  });

  revalidatePath("/flashcards");
  revalidatePath("/dashboard");
}

export async function generateCardsAction(formData: FormData) {
  const userId = await requireUserId();
  const {
    source,
    noteId,
    subjectId,
    topicId,
    context,
    materialLength,
    error,
    ocr,
    pages,
    skippedPages,
  } = await resolveCardSource(userId, formData);
  const count = clamp(Number(formData.get("count") ?? 8), 1, 20);

  const partial =
    skippedPages && skippedPages > 0
      ? `&pages=${pages ?? ""}&skipped=${skippedPages}`
      : "";

  if (error) {
    redirect(`/flashcards?error=${encodeURIComponent(error)}`);
  }
  if (noteId && materialLength < 40) {
    redirect("/flashcards?error=note-empty");
  }
  if (!noteId && materialLength > 0 && materialLength < 40) {
    redirect("/flashcards?error=no-source");
  }
  if (!source.trim()) {
    redirect("/flashcards?error=no-source");
  }

  let cards;
  try {
    cards = await makeFlashcards(source, count, context || undefined);
  } catch (error) {
    // The mandatory content-understanding stage rejected the material.
    if (error instanceof InsufficientMaterialError) {
      redirect(`/flashcards?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  if (cards.length === 0) {
    redirect(`/flashcards?error=no-cards${ocr ? "&ocr=1" : ""}${partial}`);
  }

  // Link each card to the syllabus topic it actually came from. When a label
  // cannot be matched, fall back to the topic the student selected. Only
  // approved topics count — the approved syllabus is the source of truth.
  const subjectTopics = subjectId
    ? await prisma.topic.findMany({
        where: { userId, subjectId, approved: true },
        select: { id: true, name: true },
      })
    : [];
  const topicCandidates = subjectTopics.map((entry) => ({
    id: entry.id,
    name: entry.name,
    masteryScore: 0,
  }));

  await prisma.flashcard.createMany({
    data: cards.map((card) => {
      const matchedId = matchTopicIdFromText(
        card.topicLabel,
        `${card.front} ${card.back}`,
        topicCandidates,
        topicId,
      );
      const matched = topicCandidates.find((entry) => entry.id === matchedId);
      return {
        userId,
        front: card.front.slice(0, 600),
        back: card.back.slice(0, 1200),
        subjectId,
        topicId: matchedId,
        noteId,
        source: "ai",
        format: card.format,
        topicLabel: matched?.name ?? card.topicLabel,
        sourceRef: card.sourceRef,
        difficulty: card.difficulty,
        dueAt: new Date(),
      };
    }),
  });

  revalidatePath("/flashcards");
  revalidatePath("/dashboard");
  redirect(`/flashcards?created=${cards.length}${ocr ? "&ocr=1" : ""}${partial}`);
}

export async function reviewCardAction(cardId: string, rating: string) {
  const userId = await requireUserId();
  const safeRating: Rating = ["easy", "medium", "hard"].includes(rating)
    ? (rating as Rating)
    : "medium";

  const card = await prisma.flashcard.findFirst({ where: { id: cardId, userId } });
  if (!card) return { ok: false as const };

  let accuracy: number | undefined;
  if (card.topicId) {
    const weak = await getWeakTopics(userId);
    const entry = weak.find((topic) => topic.topicId === card.topicId);
    if (entry) accuracy = entry.accuracy / 100;
  }

  const scheduled = scheduleCard(
    {
      ease: card.ease,
      intervalDays: card.intervalDays,
      repetitions: card.repetitions,
      lapses: card.lapses,
    },
    safeRating,
    new Date(),
    accuracy,
  );

  await prisma.$transaction([
    prisma.flashcard.update({
      where: { id: card.id },
      data: {
        ease: scheduled.ease,
        intervalDays: scheduled.intervalDays,
        repetitions: scheduled.repetitions,
        lapses: scheduled.lapses,
        dueAt: scheduled.dueAt,
        lastRating: safeRating,
        lastReviewedAt: new Date(),
      },
    }),
    prisma.flashcardReview.create({
      data: {
        cardId: card.id,
        userId,
        rating: safeRating,
        nextDueAt: scheduled.dueAt,
      },
    }),
  ]);

  await awardXp(userId, "flashcard", XP_RULES.flashcard, card.id);
  await evaluateAchievements(userId);

  revalidatePath("/flashcards");
  revalidatePath("/dashboard");

  return {
    ok: true as const,
    intervalDays: scheduled.intervalDays,
    dueAt: scheduled.dueAt.toISOString(),
  };
}

export async function deleteCardAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  await prisma.flashcard.deleteMany({ where: { id, userId } });
  revalidatePath("/flashcards");
  revalidatePath("/subjects");
}

export type FlashcardJobState = { jobId?: string; error?: string };

/**
 * Starts a background flashcard job and returns its id immediately.
 *
 * The client polls `/api/jobs/[id]` for staged progress. Generation is never
 * run twice for a double-click: while a recent job is queued or running, the
 * same job id is returned instead of creating a second deck.
 */
export async function startFlashcardJobAction(
  _previous: FlashcardJobState,
  formData: FormData,
): Promise<FlashcardJobState> {
  const userId = await requireUserId();
  const resolved = await resolveCardSource(userId, formData);
  const count = clamp(Number(formData.get("count") ?? 8), 1, 20);

  if (resolved.error) return { error: resolved.error };
  if (resolved.noteId && resolved.materialLength < 40) {
    return {
      error:
        "That note does not have enough text yet. Add a few sentences (or a clearer scan) and try again.",
    };
  }
  if (!resolved.source.trim()) {
    return {
      error: "Add a note, subject, pasted text, or a file before generating cards.",
    };
  }

  const recentCutoff = new Date(Date.now() - 2 * 60 * 1000);
  const active = await prisma.generationJob.findFirst({
    where: {
      userId,
      kind: "flashcards",
      status: { in: ["queued", "running"] },
      createdAt: { gte: recentCutoff },
    },
    orderBy: { createdAt: "desc" },
  });
  if (active) return { jobId: active.id };

  const job = await prisma.generationJob.create({
    data: {
      userId,
      kind: "flashcards",
      status: "queued",
      stage: "Queued",
      progress: 0,
      total: count,
      subjectId: resolved.subjectId,
      topicId: resolved.topicId,
      noteId: resolved.noteId,
      payload: JSON.stringify({
        source: resolved.source.slice(0, 200_000),
        context: resolved.context,
        count,
      }),
    },
  });

  // Fire and forget. The runner updates the job row, so the client can poll it
  // even though this action has already returned.
  void runFlashcardJob(job.id);

  revalidatePath("/flashcards");
  revalidatePath("/subjects");
  return { jobId: job.id };
}

/**
 * Deletes every card in the selected scope (a subject, a topic, or all cards).
 * Only flashcards and their review history are touched — notes, quizzes and
 * plan progress are left alone. The form must type DELETE to confirm.
 */
export async function deleteAllCardsAction(formData: FormData) {
  const userId = await requireUserId();
  const subjectId = String(formData.get("subjectId") ?? "") || null;
  const topicId = String(formData.get("topicId") ?? "") || null;
  const confirm = String(formData.get("confirm") ?? "").trim().toUpperCase();

  const back = subjectId ? `/flashcards?subject=${subjectId}` : "/flashcards";
  if (confirm !== "DELETE") {
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=confirm`);
  }

  if (subjectId) {
    const subject = await prisma.subject.findFirst({
      where: { id: subjectId, userId },
      select: { id: true },
    });
    if (!subject) redirect("/flashcards?error=no-source");
  }

  if (topicId) {
    const topic = await prisma.topic.findFirst({
      where: { id: topicId, userId },
      select: { id: true },
    });
    if (!topic) redirect("/flashcards?error=no-source");
  }

  const where = {
    userId,
    ...(subjectId ? { subjectId } : {}),
    ...(topicId ? { topicId } : {}),
  };
  const deleted = await prisma.flashcard.count({ where });
  await prisma.flashcard.deleteMany({ where });

  revalidatePath("/flashcards");
  revalidatePath("/subjects");
  revalidatePath("/dashboard");
  redirect(
    `${back}${back.includes("?") ? "&" : "?"}deleted=${deleted}`,
  );
}
