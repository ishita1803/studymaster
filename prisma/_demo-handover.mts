/**
 * Account reset for demo handover:
 * 1. Consistent SQLite backup (VACUUM INTO) before any destructive change.
 * 2. Deletes the real user's account (explicit request) + the leftover
 *    e2e-check fixture user. All cascades wipe their data only.
 * 3. Enriches the demo account so the showcase is complete: upcoming exams
 *    get selected topics (capacity banner + exam planner), the roadmap plan
 *    is rebuilt from today via the app's own plan service, and presence
 *    fields (lastActiveDate) are refreshed.
 * AI features are untouched.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { generatePlanForUser } from "../src/lib/plan-service";
import { createHash } from "node:crypto";

const p = new PrismaClient();

// 1. Backup.
const stamp = createHash("sha1").update(String(Date.now())).digest("hex").slice(0, 6);
const backupPath = `C:\\Users\\Lenovo\\OneDrive\\Desktop\\miniproject\\studyplanner project\\prisma\\dev_backup_20261112_demo-handover_${stamp}.db`;
await p.$executeRawUnsafe(
  `VACUUM INTO '${backupPath.replace(/\\/g, "\\\\")}'`,
);
console.log("backup written:", backupPath);

// 2. Deletions.
const realUserId = "cmvxzvvyt0008to1kv9f7ya6y";
const e2eUserId = "cmw974l0v0000tou0h2umyv4j";

const before = await p.user.count();
await p.user.delete({ where: { id: realUserId } });
await p.user.delete({ where: { id: e2eUserId } }).catch(() => null);
const after = await p.user.count();
console.log(`users: ${before} -> ${after} (deleted the real account + e2e fixture)`);

// 3. Demo enrichment.
const demo = await p.user.findUnique({
  where: { email: "demo@studymaster.app" },
  select: { id: true },
});
if (!demo) throw new Error("demo user missing");

const demoSubjects = await p.subject.findMany({
  where: { userId: demo.id },
  select: { id: true, name: true, topics: { select: { id: true, name: true } } },
});
const bySubject = new Map(demoSubjects.map((s) => [s.name, s]));
const topicId = (subject: string, topic: string) =>
  bySubject.get(subject)?.topics.find((t) => t.name === topic)?.id;

const demoExams = await p.exam.findMany({
  where: { userId: demo.id, date: { gte: new Date() } },
  orderBy: { date: "asc" },
  select: { id: true, name: true },
});
console.log("upcoming demo exams:", demoExams.map((e) => e.name));

const selections: Record<string, [string, string, string][]> = {
  Biology: [
    ["Cell division", "easy"],
    ["Genetics & inheritance", "medium"],
    ["Human physiology", "hard"],
  ],
  Chemistry: [
    ["Acids & bases", "easy"],
    ["Chemical bonding", "medium"],
    ["Organic reactions", "hard"],
  ],
  Mathematics: [
    ["Quadratic equations", "medium"],
    ["Trigonometry", "hard"],
  ],
};

for (const exam of demoExams) {
  const subjectName = demoSubjects.find((s) =>
    selections[s.name] ? true : false,
  )?.name;
  void subjectName;
}

// Attach topic selections per exam subject: match exam -> subject by name.
const examsWithSubject = await p.exam.findMany({
  where: { userId: demo.id, date: { gte: new Date() } },
  orderBy: { date: "asc" },
  select: { id: true, name: true, subjectId: true },
});
for (const exam of examsWithSubject) {
  const subject = demoSubjects.find((s) => s.id === exam.subjectId);
  if (!subject) continue;
  const picks = selections[subject.name] ?? [];
  for (const [topicName, difficulty] of picks) {
    const id = topicId(subject.name, topicName);
    if (!id) continue;
    await p.examTopic.upsert({
      where: { examId_topicId: { examId: exam.id, topicId: id } },
      create: { examId: exam.id, topicId: id, difficulty },
      update: { difficulty },
    });
  }
  console.log(
    `exam "${exam.name}" (${subject.name}): topic selections ensured`,
  );
}

// Presence refresh + fresh roadmap plan from today via the app's own service.
const today = new Date();
await p.user.update({
  where: { id: demo.id },
  data: { lastActiveDate: today },
});
await generatePlanForUser(demo.id, { startDate: today });
console.log("demo plan rebuilt from today");

// 4. Final inventory.
const demoState = {
  subjects: await p.subject.count({ where: { userId: demo.id } }),
  topics: await p.topic.count({ where: { userId: demo.id } }),
  notes: await p.note.count({ where: { userId: demo.id } }),
  exams: await p.exam.count({ where: { userId: demo.id } }),
  examTopics: await p.examTopic.count({ where: { exam: { userId: demo.id } } }),
  quizzes: await p.quiz.count({ where: { userId: demo.id } }),
  flashcards: await p.flashcard.count({ where: { userId: demo.id } }),
};
console.log("DEMO STATE:", JSON.stringify(demoState));
const allUsers = await p.user.findMany({ select: { email: true } });
console.log("REMAINING USERS:", allUsers.map((u) => u.email));

await p.$disconnect();
