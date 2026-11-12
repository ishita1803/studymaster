/**
 * Verifies the redesigned sequential scheduler against the demo account:
 * prints each upcoming day's stored plan items (kind + topic + subject) so
 * the multi-exam sequencing can be checked by eye.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { generatePlanForUser, capacityShortfallsForUser } from "../src/lib/plan-service";
import { dateKey } from "../src/lib/utils";

const p = new PrismaClient();

const demo = await p.user.findUnique({
  where: { email: "demo@studymaster.app" },
  select: { id: true },
});
if (!demo) throw new Error("demo user missing");

const today = new Date();
await generatePlanForUser(demo.id, { startDate: today });
console.log("plan rebuilt\n");

const exams = await p.exam.findMany({
  where: { userId: demo.id },
  orderBy: { date: "asc" },
  select: { id: true, name: true, date: true, subject: { select: { name: true } } },
});
console.log("exams (local dates):");
for (const exam of exams) {
  console.log(`  ${exam.name} (${exam.subject.name}) — ${dateKey(exam.date)}`);
}

const horizonStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
const horizonEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 13);
const days = await p.planDay.findMany({
  where: { userId: demo.id, date: { gte: horizonStart, lte: horizonEnd } },
  orderBy: { date: "asc" },
  include: {
    items: {
      include: { topic: { select: { name: true, subject: { select: { name: true } } } } },
    },
  },
});

for (const day of days) {
  const items = day.items.slice().sort((a, b) => a.order - b.order);
  if (items.length === 0) {
    console.log(`${dateKey(day.date)}: (empty)`);
    continue;
  }
  console.log(`${dateKey(day.date)}:`);
  for (const item of items) {
    const subject = item.topic?.subject?.name ?? item.subjectId ?? "?";
    console.log(
      `    ${item.startTime ?? "--:--"} ${item.kind.padEnd(8)} ${String(item.minutes).padStart(3)}m  ${subject} · ${item.topic?.name ?? item.title}`,
    );
  }
}

console.log("\ncapacity shortfalls:");
const shortfalls = await capacityShortfallsForUser(demo.id);
if (shortfalls.length === 0) {
  console.log("  none — everything fits");
}
for (const entry of shortfalls) {
  console.log(
    `  ${entry.subjectName} · exam in ${entry.examInDays}d · required ${entry.requiredMinutes}m · ` +
      `studyDays ${entry.studyDays} · available ${entry.availableMinutes}m · shortfall ${entry.shortfallMinutes}m`,
  );
}

await p.$disconnect();
