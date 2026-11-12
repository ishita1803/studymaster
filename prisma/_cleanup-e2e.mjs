import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const user = await prisma.user.findUnique({ where: { email: "demo@studymaster.app" } });
const subjects = await prisma.subject.findMany({
  where: { userId: user.id, name: { startsWith: "E2E Science" } },
  select: { id: true, name: true },
});
const ids = subjects.map((subject) => subject.id);
const e2eJobs = await prisma.generationJob.findMany({
  where: {
    userId: user.id,
    OR: [{ subjectId: { in: ids } }, { payload: { startsWith: '{"source":"E2E' } }],
  },
  select: { id: true },
});
const e2eJobIds = e2eJobs.map((job) => job.id);
if (e2eJobIds.length > 0) {
  await prisma.flashcard.deleteMany({ where: { userId: user.id, jobId: { in: e2eJobIds } } });
}
await prisma.flashcard.deleteMany({ where: { userId: user.id, subjectId: { in: ids } } });
await prisma.quiz.deleteMany({
  where: { userId: user.id, title: { startsWith: "E2E mixed quiz" } },
});
await prisma.note.deleteMany({
  where: {
    userId: user.id,
    OR: [
      { subjectId: { in: ids } },
      { subjectId: null, title: { startsWith: "E2E " } },
    ],
  },
});
await prisma.generationJob.deleteMany({
  where: {
    userId: user.id,
    OR: [{ subjectId: { in: ids } }, { id: { in: e2eJobIds } }],
  },
});
if (ids.length > 0) {
  await prisma.planItem.deleteMany({
    where: { planDay: { userId: user.id }, subjectId: { in: ids } },
  });
}
for (const subject of subjects) {
  await prisma.subject.delete({ where: { id: subject.id } });
  console.log("deleted", subject.name, subject.id);
}
await prisma.planItem.deleteMany({
  where: { planDay: { userId: user.id }, completed: false },
});
console.log("removed open plan items");
await prisma.$disconnect();
