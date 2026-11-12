import { generatePlanForUser } from "@/lib/plan-service";
import { prisma } from "@/lib/db";

function key(d: Date) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

async function main() {
  const email = process.argv[2] ?? "demo@studymaster.app";
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  console.log("Regenerating plan for", email);
  const result = await generatePlanForUser(user.id, { startDate: new Date() });
  console.log(result);

  const exams = await prisma.exam.findMany({
    where: { userId: user.id },
    include: { subject: { select: { name: true } }, examTopics: { select: { topicId: true } } },
    orderBy: { date: "asc" },
  });
  const days = await prisma.planDay.findMany({
    where: { userId: user.id },
    include: { items: { include: { subject: { select: { name: true } } } } },
  });
  for (const exam of exams) {
    const dayBefore = key(addDays(exam.date, -1));
    const day = days.find((d) => key(d.date) === dayBefore);
    const foreign = (day?.items ?? []).filter((i) => i.subject?.name !== exam.subject.name);
    const unselected = (day?.items ?? []).filter(
      (i) => i.topicId && exam.examTopics.length > 0 && !exam.examTopics.some((t) => t.topicId === i.topicId),
    );
    console.log(`DAY BEFORE ${exam.name} (${dayBefore}): ${day?.items.length ?? 0} items; foreign=${foreign.length}; unselected=${unselected.length}`);
    if (foreign.length) console.log("  foreign:", foreign.map((i) => `${i.subject?.name}/${i.title}/${i.kind}`));
  }
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
