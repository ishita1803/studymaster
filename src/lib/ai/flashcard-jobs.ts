import { prisma } from "@/lib/db";
import { makeFlashcards } from "@/lib/ai/study-tools";
import { matchTopicIdFromText } from "@/lib/topic-feedback";

export type FlashcardJobPayload = {
  source: string;
  context?: string;
  count: number;
};

export type FlashcardJobStatus = {
  id: string;
  status: string;
  stage: string;
  progress: number;
  total: number;
  produced: number;
  message: string;
  error: string;
  cards: {
    id: string;
    front: string;
    back: string;
    format: string;
    topicLabel: string;
    sourceRef: string;
    difficulty: string;
  }[];
};

function readPayload(raw: string): FlashcardJobPayload | null {
  try {
    const parsed = JSON.parse(raw) as Partial<FlashcardJobPayload>;
    if (!parsed || typeof parsed.source !== "string" || !parsed.source.trim()) {
      return null;
    }
    return {
      source: parsed.source,
      context: typeof parsed.context === "string" ? parsed.context : undefined,
      count: Math.min(20, Math.max(1, Number(parsed.count) || 8)),
    };
  } catch {
    return null;
  }
}

/**
 * Runs one flashcard generation job to completion.
 *
 * The action that starts a job returns immediately so the browser can poll
 * `/api/jobs/[id]`. This runner updates the job row after every stage, which is
 * what makes the progress bar real instead of a fake timer.
 */
export async function runFlashcardJob(jobId: string) {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job || job.kind !== "flashcards") return;

  // Only one runner may claim a queued job. A completed job is never re-run,
  // so a double-click cannot create a duplicate deck.
  const claimed = await prisma.generationJob.updateMany({
    where: { id: job.id, status: "queued" },
    data: {
      status: "running",
      stage: "Reading your material",
      progress: 4,
      message: "Preparing your cards…",
      error: "",
    },
  });
  if (claimed.count === 0) return;

  const payload = readPayload(job.payload);
  if (!payload) {
    await prisma.generationJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        stage: "Failed",
        error: "The source material could not be read. Try again.",
      },
    });
    return;
  }

  try {
    const cards = await makeFlashcards(
      payload.source,
      payload.count,
      payload.context,
      async (update) => {
        await prisma.generationJob.update({
          where: { id: job.id },
          data: {
            stage: update.stage.slice(0, 160),
            progress: Math.max(0, Math.min(96, Math.round(update.progress))),
            produced: Math.max(0, update.produced ?? 0),
            message: update.stage.slice(0, 200),
          },
        });
      },
    );

    if (cards.length === 0) {
      await prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          stage: "No usable cards",
          progress: 100,
          message: "",
          error:
            "Nova could not find clear, studyable facts in that material. Try a fuller paragraph or a clearer scan.",
        },
      });
      return;
    }

    await prisma.generationJob.update({
      where: { id: job.id },
      data: {
        stage: "Saving your deck",
        progress: 96,
        produced: cards.length,
        total: cards.length,
        message: "Saving cards…",
      },
    });

    // Link each card to the real syllabus topic it came from, so review
    // results, weak-topic detection and the roadmap all share one topic.
    // Only approved topics count — the approved syllabus is the source of truth.
    const subjectTopics = job.subjectId
      ? await prisma.topic.findMany({
          where: { userId: job.userId, subjectId: job.subjectId, approved: true },
          select: { id: true, name: true },
        })
      : [];
    const topicCandidates = subjectTopics.map((topic) => ({
      id: topic.id,
      name: topic.name,
      masteryScore: 0,
    }));

    await prisma.flashcard.createMany({
      data: cards.map((card) => {
        const matchedId = matchTopicIdFromText(
          card.topicLabel,
          `${card.front} ${card.back}`,
          topicCandidates,
          job.topicId,
        );
        const matched = topicCandidates.find((topic) => topic.id === matchedId);
        return {
          userId: job.userId,
          subjectId: job.subjectId,
          topicId: matchedId,
          noteId: job.noteId,
          jobId: job.id,
          front: card.front.slice(0, 600),
          back: card.back.slice(0, 1200),
          source: "ai",
          format: card.format,
          topicLabel: matched?.name ?? card.topicLabel,
          sourceRef: card.sourceRef,
          difficulty: card.difficulty,
          dueAt: new Date(),
        };
      }),
    });

    await prisma.generationJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        stage: "Done",
        progress: 100,
        produced: cards.length,
        total: cards.length,
        message: `${cards.length} card${cards.length === 1 ? "" : "s"} ready`,
      },
    });
  } catch (error) {
    console.error("[flashcards] generation job failed:", error);
    await prisma.generationJob
      .update({
        where: { id: job.id },
        data: {
          status: "failed",
          stage: "Failed",
          progress: 100,
          message: "",
          error:
            error instanceof Error
              ? error.message.slice(0, 400)
              : "Card generation failed. Please try again.",
        },
      })
      .catch(() => undefined);
  }
}

/** Shape returned to the polling client. */
export async function getFlashcardJob(
  userId: string,
  jobId: string,
): Promise<FlashcardJobStatus | null> {
  const job = await prisma.generationJob.findFirst({
    where: { id: jobId, userId, kind: "flashcards" },
  });
  if (!job) return null;

  const cards =
    job.status === "completed"
      ? await prisma.flashcard.findMany({
          where: { userId, jobId: job.id },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            front: true,
            back: true,
            format: true,
            topicLabel: true,
            sourceRef: true,
            difficulty: true,
          },
        })
      : [];

  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    total: job.total,
    produced: job.produced,
    message: job.message,
    error: job.error,
    cards,
  };
}
