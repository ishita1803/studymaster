import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const d = new Date();
d.setHours(0, 0, 0, 0);
const day = await prisma.planDay.findFirst({
  where: { user: { email: "demo@studymaster.app" }, date: d },
  include: { items: { include: { subject: true, topic: true } } },
});
console.log(
  day.items.map((item) => ({
    title: item.title,
    kind: item.kind,
    subject: item.subject?.name,
    subjectId: item.subjectId,
    topic: item.topic?.name,
    completed: item.completed,
    reason: item.reason,
  })),
);
const exams = await prisma.exam.findMany({
  where: { user: { email: "demo@studymaster.app" } },
  orderBy: { date: "asc" },
  select: { id: true, name: true, date: true, subjectId: true },
});
console.log(exams);
await prisma.$disconnect();
