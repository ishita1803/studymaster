import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const user = await prisma.user.findUnique({ where: { email: "demo@studymaster.app" } });
const subject = await prisma.subject.findFirst({
  where: { userId: user.id, name: { startsWith: "E2E Science" } },
  orderBy: { createdAt: "desc" },
});
console.log("subject", subject?.id, subject?.name);
const topics = await prisma.topic.findMany({
  where: { userId: user.id, subjectId: subject.id },
  orderBy: [{ position: "asc" }, { createdAt: "asc" }],
});
for (const topic of topics) {
  console.log(`${topic.kind.padEnd(9)} | ${topic.chapter.padEnd(28)} | ${topic.name}`);
}
await prisma.$disconnect();
