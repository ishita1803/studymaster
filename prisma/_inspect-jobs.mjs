import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const user = await prisma.user.findUnique({ where: { email: "demo@studymaster.app" } });
const jobs = await prisma.generationJob.findMany({
  where: { userId: user.id },
  orderBy: { createdAt: "asc" },
  select: { id: true, kind: true, status: true, subjectId: true, noteId: true, createdAt: true, payload: true },
});
console.log(
  jobs.map((job) => ({
    id: job.id,
    kind: job.kind,
    status: job.status,
    subjectId: job.subjectId,
    noteId: job.noteId,
    createdAt: job.createdAt,
    payload: job.payload.slice(0, 120),
  })),
);
await prisma.$disconnect();
