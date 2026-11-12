/**
 * One-off cleanup: restore prisma/dev.db to demo-only (removes the
 * OneDrive-resurrected personal account). Run: npx tsx prisma/_cleanup-devdb.mts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ datasources: { db: { url: "file:./dev.db" } } });

const users = await prisma.user.findMany({ select: { id: true, email: true } });
console.log("before:", users.map((u) => u.email).join(", "));

const stale = users.filter((u) => u.email !== "demo@studymaster.app");
for (const u of stale) {
  await prisma.user.delete({ where: { id: u.id } });
  console.log("deleted:", u.email);
}

const after = await prisma.user.findMany({ select: { email: true } });
console.log("after:", after.map((u) => u.email).join(", ") || "(none)");
console.log(
  "counts:",
  JSON.stringify({
    subjects: await prisma.subject.count(),
    exams: await prisma.exam.count(),
    planDays: await prisma.planDay.count(),
  })
);
await prisma.$disconnect();
