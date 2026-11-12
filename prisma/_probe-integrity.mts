/** Probe: verify no user data was harmed (counts + the reserved real exam). */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const [users, subjects, topics, notes, exams, examTopics, cards, quizzes, plans, items] =
  await Promise.all([
    prisma.user.count(),
    prisma.subject.count(),
    prisma.topic.count(),
    prisma.note.count(),
    prisma.exam.count(),
    prisma.examTopic.count(),
    prisma.flashcard.count(),
    prisma.quiz.count(),
    prisma.planDay.count(),
    prisma.planItem.count(),
  ]);
console.log(
  JSON.stringify({
    users, subjects, topics, notes, exams,
    examTopics, cards, quizzes, planDays: plans, planItems: items,
  }),
);
const reserved = await prisma.exam.findUnique({
  where: { id: "cmw6avxig000ftocov75f1cvw" },
  select: { name: true, date: true, subjectId: true },
});
console.log("reserved real exam:", JSON.stringify(reserved));
const demo = await prisma.subject.count({ where: { id: "cmw1lb34h0002toaksb68b03r" } });
console.log("demo Biology subject present:", demo === 1 ? "OK" : "MISSING");
await prisma.$disconnect();
