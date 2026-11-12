import { prisma } from "@/lib/db";

function key(d: Date) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "demo@studymaster.app" } });
  const exams = await prisma.exam.findMany({
    where: { userId: user.id },
    include: { subject: { select: { name: true } } },
    orderBy: { date: "asc" },
  });
  console.log("EXAMS", exams.map((e) => `${e.name}=${key(e.date)}`));

  const days = await prisma.planDay.findMany({
    where: { userId: user.id },
    include: { items: { include: { subject: { select: { name: true } } }, orderBy: { order: "asc" } } },
    orderBy: { date: "asc" },
  });

  for (const d of days) {
    const k = key(d.date);
    if (["2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17"].includes(k)) {
      console.log(`\n${k} (${d.items.length} items)`);      for (const i of d.items) {
        console.log(`  [${i.completed ? "x" : " "}] ${i.subject?.name} | ${i.title} | ${i.kind} | ${i.minutes}m | id=${i.id}`);
      }
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
