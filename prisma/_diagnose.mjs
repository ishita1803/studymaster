import { readFile } from "node:fs/promises";
import { extractText, getDocumentProxy } from "unpdf";
import { PrismaClient } from "@prisma/client";

const pdfPath = "C:/Users/Lenovo/OneDrive/Desktop/miniproject/chapters done.pdf";
const bytes = new Uint8Array(await readFile(pdfPath));
const pdf = await getDocumentProxy(bytes);
const result = await extractText(pdf, { mergePages: false });
const pages = Array.isArray(result.text) ? result.text : [result.text];
console.log("PDF pages:", pages.length);
let total = 0;
pages.forEach((page, index) => {
  const text = (page ?? "").replace(/\s+/g, " ").trim();
  total += text.length;
  console.log(
    `p${String(index + 1).padStart(2)} chars=${String(text.length).padStart(5)} | ${text.slice(0, 110)}`,
  );
});
console.log("total chars:", total);

const prisma = new PrismaClient();
const users = await prisma.user.findMany({
  select: { id: true, email: true, name: true },
});
console.log("\nUSERS", users);
for (const user of users) {
  const subjects = await prisma.subject.findMany({
    where: { userId: user.id },
    include: {
      exams: true,
      notes: { select: { id: true, title: true, pages: true, status: true, syllabusStatus: true } },
      topics: { select: { id: true, name: true, chapter: true, parentId: true, approved: true, sourceRef: true } },
      _count: { select: { topics: true, notes: true, exams: true } },
    },
  });
  console.log(`\n=== ${user.email} ===`);
  for (const subject of subjects) {
    console.log(
      `subject ${subject.name} (${subject.id}) examDate=${subject.examDate?.toISOString() ?? "null"} topics=${subject._count.topics} notes=${subject._count.notes} exams=${subject._count.exams}`,
    );
    for (const exam of subject.exams) {
      console.log(`  exam ${exam.name} date=${exam.date.toISOString()} id=${exam.id}`);
      const et = await prisma.examTopic.count({ where: { examId: exam.id } });
      console.log(`    examTopics=${et}`);
    }
    for (const note of subject.notes) {
      console.log(`  note ${note.title} pages=${note.pages} status=${note.status} syllabus=${note.syllabusStatus}`);
    }
    const chapters = new Map();
    for (const topic of subject.topics) {
      const key = topic.chapter || "(none)";
      chapters.set(key, (chapters.get(key) ?? 0) + 1);
    }
    console.log("  chapter counts:", [...chapters.entries()]);
  }
  const days = await prisma.planDay.findMany({
    where: { userId: user.id },
    select: { date: true, _count: { select: { items: true } } },
    orderBy: { date: "asc" },
  });
  if (days.length) {
    console.log(
      `  plan days=${days.length} first=${days[0].date.toISOString().slice(0, 10)} last=${days[days.length - 1].date.toISOString().slice(0, 10)}`,
    );
  }
}
await prisma.$disconnect();
