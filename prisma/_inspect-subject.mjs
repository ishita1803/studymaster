import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const subject = await prisma.subject.findFirst({
  where: { name: "miniproject" },
  include: {
    topics: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
    notes: true,
    exams: { include: { examTopics: true } },
  },
});
console.log("SUBJECT", subject?.name, subject?.id);
for (const topic of subject.topics) {
  console.log(
    `${topic.id} | ${topic.chapter} | ${topic.name} | parent=${topic.parentId} | approved=${topic.approved} | ref=${topic.sourceRef} | kind=${topic.kind}`,
  );
}
for (const note of subject.notes) {
  console.log("\nNOTE", note.title, "len", note.content.length, "pages", note.pages, "status", note.status);
  console.log("FIRST 1200:\n", note.content.slice(0, 1200));
  console.log("\nLAST 800:\n", note.content.slice(-800));
  console.log("\nCHAPTER MARKERS:");
  for (const m of note.content.matchAll(/CHAPTER[-\s]*\d+[^\n]{0,90}/gi)) {
    console.log(m.index, m[0]);
  }
}
for (const exam of subject.exams) {
  console.log("\nEXAM", exam.name, exam.date.toISOString(), "topics", exam.examTopics.map((t) => t.topicId));
}
await prisma.$disconnect();
