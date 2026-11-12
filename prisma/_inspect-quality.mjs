import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const user = await prisma.user.findUnique({ where: { email: "demo@studymaster.app" } });
const subject = await prisma.subject.findFirst({
  where: { userId: user.id, name: { startsWith: "E2E Science" } },
  orderBy: { createdAt: "desc" },
});
console.log("SUBJECT", subject?.name, subject?.id);

const cards = await prisma.flashcard.findMany({
  where: { userId: user.id, subjectId: subject.id },
  orderBy: { createdAt: "asc" },
  include: { topic: { select: { name: true } } },
});
console.log("\nFLASHCARDS", cards.length);
for (const card of cards) {
  console.log(
    JSON.stringify({
      format: card.format,
      topic: card.topic?.name,
      topicLabel: card.topicLabel,
      sourceRef: card.sourceRef,
      difficulty: card.difficulty,
      front: card.front,
      back: card.back,
    }),
  );
}

const quiz = await prisma.quiz.findFirst({
  where: { userId: user.id, subjectId: subject.id },
  orderBy: { createdAt: "desc" },
  include: { questions: { orderBy: { order: "asc" } } },
});
console.log("\nQUIZ", quiz?.title, quiz?.questionTypes);
for (const question of quiz.questions) {
  console.log(
    JSON.stringify({
      type: question.type,
      format: question.format,
      topicLabel: question.topicLabel,
      difficulty: question.difficulty,
      prompt: question.prompt,
      options: question.options,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
    }),
  );
}

const fillblank = await prisma.question.count({ where: { type: "fillblank" } });
const cloze = await prisma.flashcard.count({ where: { format: "cloze" } });
console.log("\nGLOBAL fillblank questions:", fillblank, "cloze cards:", cloze);
const typeCounts = await prisma.question.groupBy({ by: ["type"], _count: true });
console.log("All question types:", typeCounts);
const formatCounts = await prisma.flashcard.groupBy({ by: ["format"], _count: true });
console.log("All card formats:", formatCounts);
await prisma.$disconnect();
