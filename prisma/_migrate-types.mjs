import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const before = await prisma.question.groupBy({ by: ["type"], _count: true });
console.log("before", before);

const fillblank = await prisma.question.updateMany({
  where: { type: "fillblank" },
  data: { type: "short" },
});
console.log("fillblank -> short:", fillblank.count);

const cloze = await prisma.flashcard.updateMany({
  where: { format: "cloze" },
  data: { format: "definition" },
});
console.log("cloze -> definition:", cloze.count);

const after = await prisma.question.groupBy({ by: ["type"], _count: true });
console.log("after", after);

await prisma.$disconnect();
