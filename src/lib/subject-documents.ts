import { prisma } from "@/lib/db";

/**
 * Reads the uploaded documents for a subject so study-tool generation is
 * grounded in the same material the syllabus was extracted from.
 *
 * Generating cards or quizzes for a whole subject used to fall back to its
 * topic names only. Names such as "Mitosis" contain no definitions, so the
 * local generator correctly refused to invent cards. Reading the subject's
 * real documents fixes that without changing how a note-scoped request works.
 */
export async function loadSubjectDocuments(
  userId: string,
  subjectId: string,
): Promise<{ text: string; length: number }> {
  const notes = await prisma.note.findMany({
    where: { userId, subjectId, content: { not: "" } },
    orderBy: { createdAt: "asc" },
    select: { title: true, content: true },
  });

  const parts: string[] = [];
  let length = 0;
  for (const note of notes) {
    const content = note.content.trim();
    if (!content) continue;
    if (length + content.length > 200_000) break;
    parts.push([note.title, content].filter(Boolean).join("\n"));
    length += content.length;
  }
  return { text: parts.join("\n\n"), length };
}
