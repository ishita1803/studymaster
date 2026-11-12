import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const demo = await prisma.user.findUnique({ where: { email: "demo@studymaster.app" } });
const testUser = await prisma.user.findUnique({
  where: { email: "ishitaprajapati1803@gmail.com" },
});

function startOfDay(date = new Date()) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

async function summary(userId) {
  return {
    subjects: await prisma.subject.count({ where: { userId } }),
    topics: await prisma.topic.count({ where: { userId } }),
    notes: await prisma.note.count({ where: { userId } }),
    cards: await prisma.flashcard.count({ where: { userId } }),
    quizzes: await prisma.quiz.count({ where: { userId } }),
    questions: await prisma.question.count({ where: { quiz: { userId } } }),
    exams: await prisma.exam.count({ where: { userId } }),
    planDays: await prisma.planDay.count({ where: { userId } }),
    planItems: await prisma.planItem.count({ where: { planDay: { userId } } }),
    completed: await prisma.planItem.count({
      where: { planDay: { userId }, completed: true },
    }),
  };
}

console.log("DEMO", await summary(demo.id));
console.log("TEST USER", testUser ? await summary(testUser.id) : "missing");
console.log(
  "E2E subjects remaining",
  await prisma.subject.count({ where: { userId: demo.id, name: { startsWith: "E2E Science" } } }),
);
console.log("fillblank questions", await prisma.question.count({ where: { type: "fillblank" } }));
console.log("cloze cards", await prisma.flashcard.count({ where: { format: "cloze" } }));
console.log(
  "question types",
  await prisma.question.groupBy({ by: ["type"], _count: true }),
);
console.log(
  "card formats",
  await prisma.flashcard.groupBy({ by: ["format"], _count: true }),
);

const exams = await prisma.exam.findMany({
  where: { userId: demo.id },
  orderBy: { date: "asc" },
  include: { examTopics: true },
});
const today = startOfDay();
for (const exam of exams) {
  const day = new Date(exam.date);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - 1);
  const planDay = await prisma.planDay.findFirst({
    where: { userId: demo.id, date: day },
    include: { items: true },
  });
  const open = (planDay?.items ?? []).filter((item) => !item.completed);
  const selected = new Set(exam.examTopics.map((entry) => entry.topicId));
  const foreign = open.filter((item) => item.subjectId !== exam.subjectId).length;
  const unselected =
    selected.size > 0
      ? open.filter((item) => !item.topicId || !selected.has(item.topicId)).length
      : 0;
  console.log(
    `DAY BEFORE ${exam.name} (${day.toISOString().slice(0, 10)}): ${open.length} open; foreign=${foreign}; unselected=${unselected}`,
  );
}
await prisma.$disconnect();
