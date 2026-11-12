/** Inspect which topics exist per subject (read-only) to see the "weird" ones. */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const subjects = await prisma.subject.findMany({
  select: { id: true, name: true, userId: true },
});
for (const subject of subjects) {
  const topics = await prisma.topic.findMany({
    where: { subjectId: subject.id },
    orderBy: [{ position: "asc" }],
    select: {
      id: true,
      name: true,
      chapter: true,
      approved: true,
      parentId: true,
      status: true,
    },
  });
  console.log(`\n== ${subject.name} (${topics.length} topics) ==`);
  for (const topic of topics) {
    const flags = [topic.approved ? "approved" : "DRAFT", topic.parentId ? "leaf" : "PARENT"];
    console.log(`  ${topic.name.slice(0, 80)} [${topic.chapter.slice(0, 30)}] ${flags.join(",")}`);
  }
}
await prisma.$disconnect();
