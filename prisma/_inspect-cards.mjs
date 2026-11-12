import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const user = await prisma.user.findUnique({ where: { email: "demo@studymaster.app" } });
const jobs = await prisma.generationJob.findMany({
  where: { userId: user.id },
  orderBy: { createdAt: "desc" },
  take: 3,
});
console.log(
  jobs.map((job) => ({
    id: job.id,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    produced: job.produced,
    total: job.total,
    message: job.message,
    error: job.error,
    subjectId: job.subjectId,
  })),
);
const subject = await prisma.subject.findFirst({
  where: { userId: user.id, name: { startsWith: "E2E Science" } },
  orderBy: { createdAt: "desc" },
});
console.log("subject", subject?.id, subject?.name);
const cards = await prisma.flashcard.findMany({
  where: { userId: user.id, subjectId: subject.id },
});
console.log("cards", cards.length);
console.log(
  cards.map((card) => ({
    format: card.format,
    topicId: card.topicId,
    topicLabel: card.topicLabel,
    front: card.front.slice(0, 70),
    back: card.back.slice(0, 70),
  })),
);
await prisma.$disconnect();
