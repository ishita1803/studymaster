import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function key(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

const users = await prisma.user.findMany({ select: { id: true, email: true, name: true } });
console.log("USERS", users);

for (const user of users) {
  const [subjects, exams, notes, topics, cards, quizzes] = await Promise.all([
    prisma.subject.findMany({ where: { userId: user.id }, select: { id: true, name: true, examDate: true, syllabusApproved: true } }),
    prisma.exam.findMany({ where: { userId: user.id }, include: { subject: { select: { name: true } }, examTopics: { select: { topicId: true } } }, orderBy: { date: "asc" } }),
    prisma.note.findMany({ where: { userId: user.id }, select: { id: true, title: true, subjectId: true, status: true, syllabusStatus: true, sourceKind: true, content: true } }),
    prisma.topic.count({ where: { userId: user.id } }),
    prisma.flashcard.count({ where: { userId: user.id } }),
    prisma.quiz.count({ where: { userId: user.id } }),
  ]);
  console.log(`\n=== ${user.email} ===`);
  console.log("subjects", subjects.length, subjects.map(s => `${s.name}${s.syllabusApproved ? "" : " (unapproved)"}`));
  console.log("topics", topics, "notes", notes.length, "cards", cards, "quizzes", quizzes);
  console.log("notes:", notes.map(n => `${n.title} [${n.status}/${n.syllabusStatus}/${n.sourceKind}/${n.content.length}ch]`));
  console.log("exams:", exams.map(e => `${e.name} ${key(e.date)} ${e.subject.name} topics=${e.examTopics.length}`));

  const today = startOfDay();
  const allPlanDays = await prisma.planDay.findMany({
    where: { userId: user.id },
    include: { items: { include: { subject: { select: { name: true } }, topic: { select: { name: true } } } } },
    orderBy: { date: "asc" },
  });
  console.log("planDays", allPlanDays.length, "items", allPlanDays.reduce((a, d) => a + d.items.length, 0));

  for (const exam of exams) {
    if (new Date(exam.date) < today) continue;
    const dayBefore = key(addDays(exam.date, -1));
    const day = allPlanDays.find(d => key(d.date) === dayBefore);
    const foreign = (day?.items ?? []).filter(i => i.subject?.name !== exam.subject.name);
    const unselected = (day?.items ?? []).filter(i => i.topic && exam.examTopics.length > 0 && !exam.examTopics.some(t => t.topicId === i.topicId));
    console.log(`DAY BEFORE ${exam.name} (${dayBefore}): ${day?.items.length ?? 0} items; foreign=${foreign.length}; unselected=${unselected.length}`);
    if (foreign.length) console.log("  foreign:", foreign.map(i => `${i.subject?.name}/${i.title}/${i.kind}/done=${i.completed}`));
    if (unselected.length) console.log("  unselected:", unselected.map(i => `${i.title}/${i.kind}/done=${i.completed}`));
  }

  // Quiz type inventory
  const questions = await prisma.question.findMany({ where: { quiz: { userId: user.id } }, select: { type: true, prompt: true, correctAnswer: true } });
  const byType = {};
  for (const q of questions) byType[q.type] = (byType[q.type] || 0) + 1;
  console.log("question types:", byType);
}

await prisma.$disconnect();
