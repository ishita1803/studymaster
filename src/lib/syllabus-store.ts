import { prisma } from "@/lib/db";
import type { SyllabusRow } from "@/lib/ai/syllabus";
import { normalizeAnswer } from "@/lib/utils";

/**
 * Shared syllabus persistence used by both the note-level and subject-level
 * detection actions, and by the automatic extraction that runs after an upload.
 *
 * Detected rows are stored as unapproved topics so the student can review them
 * before they reach tests or the roadmap. Topics already present in the subject
 * (from another document or an earlier detection) are reused, so uploading two
 * files cannot duplicate the same chapter/topic.
 */

export function cleanTokens(val: string) {
  return normalizeAnswer(val)
    .replace(/^(?:chapter|unit|module|part)\s*[-–:]?\s*[0-9ivxlc]+\s*[:.\-–]?\s*/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function topicKey(name: string, chapter: string) {
  const cleanName = normalizeAnswer(name).replace(/[^a-z0-9]+/g, " ").trim();
  const cleanChapter = normalizeAnswer(chapter).replace(/[^a-z0-9]+/g, " ").trim();
  return cleanChapter ? `${cleanChapter}::${cleanName}` : cleanName;
}

export async function storeDetectedTopics(params: {
  userId: string;
  subjectId: string;
  noteId: string | null;
  rows: SyllabusRow[];
}) {
  const { userId, subjectId, noteId, rows } = params;

  return await prisma.$transaction(async (tx) => {
    // Safely remove only unapproved, untouched topics that have no dependencies
    await tx.topic.deleteMany({
      where: {
        userId,
        subjectId,
        ...(noteId ? { noteId } : {}),
        approved: false,
        status: "not_started",
        planItems: { none: {} },
        flashcards: { none: {} },
        quizzes: { none: {} },
      },
    });

    const existing = await tx.topic.findMany({
      where: { userId, subjectId },
      select: { id: true, name: true, chapter: true, kind: true },
    });

    const byKey = new Map<string, string>();
    const byStrippedKey = new Map<string, string>();
    const byName = new Map<string, string>();

    for (const topic of existing) {
      const key = topicKey(topic.name, topic.chapter);
      if (key && !byKey.has(key)) byKey.set(key, topic.id);

      const stripped = cleanTokens(topic.name);
      if (stripped && !byStrippedKey.has(stripped)) byStrippedKey.set(stripped, topic.id);

      const normName = normalizeAnswer(topic.name).replace(/[^a-z0-9]+/g, " ").trim();
      if (normName && !byName.has(normName)) byName.set(normName, topic.id);
    }

    const keyToId = new Map<string, string>();
    const seen = new Set<string>();
    let created = 0;

    for (const row of rows) {
      const key = topicKey(row.name, row.chapter);
      if (!key) continue;

      const stripped = cleanTokens(row.name);
      const normName = normalizeAnswer(row.name).replace(/[^a-z0-9]+/g, " ").trim();

      const existingId =
        byKey.get(key) ??
        (row.kind === "chapter" ? (byStrippedKey.get(stripped) ?? byName.get(normName)) : null) ??
        byStrippedKey.get(stripped) ??
        byName.get(normName);

      if (existingId) {
        keyToId.set(row.key, existingId);
        continue;
      }
      if (seen.has(key)) continue;
      seen.add(key);

      const parentId = row.parentKey ? keyToId.get(row.parentKey) ?? null : null;
      const topic = await tx.topic.create({
        data: {
          userId,
          subjectId,
          noteId,
          parentId,
          name: row.name.slice(0, 80),
          chapter: row.chapter.slice(0, 80),
          kind: row.kind,
          sourceRef: row.sourceRef.slice(0, 120),
          position: row.position,
          approved: false,
          difficulty: row.difficulty,
          importance: row.importance,
          estimatedMinutes: row.estimatedMinutes,
        },
      });
      keyToId.set(row.key, topic.id);
      byKey.set(key, topic.id);
      if (stripped) byStrippedKey.set(stripped, topic.id);
      if (normName) byName.set(normName, topic.id);
      created += 1;
    }

    return created;
  });
}
