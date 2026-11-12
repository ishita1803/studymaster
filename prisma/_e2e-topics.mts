/** Prints the demo subject's approved topics (for the note-association E2E). */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const user = await prisma.user.findUnique({ where: { email: "demo@studymaster.app" } });
const topics = await prisma.topic.findMany({
  where: { userId: user!.id, approved: true },
  select: { id: true, name: true, chapter: true },
  take: 8,
});
console.log(JSON.stringify(topics, null, 1));
await prisma.$disconnect();
