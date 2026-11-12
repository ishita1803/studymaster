import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const user = await prisma.user.findUnique({ where: { email: "demo@studymaster.app" } });
const subjects = await prisma.subject.findMany({
  where: { userId: user.id },
  orderBy: { createdAt: "asc" },
  select: { id: true, name: true, createdAt: true, _count: { select: { notes: true, flashcards: true, quizzes: true } } },
});
console.log("SUBJECTS", subjects);
const notes = await prisma.note.findMany({
  where: { userId: user.id },
  orderBy: { createdAt: "asc" },
  select: { id: true, title: true, subjectId: true, sourceKind: true, createdAt: true },
});
console.log("NOTES", notes);
const orphanNotes = notes.filter((note) => !note.subjectId);
console.log("ORPHAN NOTES", orphanNotes);
const orphanCards = await prisma.flashcard.findMany({
  where: { userId: user.id, subjectId: null },
  select: { id: true, front: true, subjectId: true, topicId: true, jobId: true, createdAt: true },
});
console.log("ORPHAN CARDS", orphanCards);
await prisma.$disconnect();
