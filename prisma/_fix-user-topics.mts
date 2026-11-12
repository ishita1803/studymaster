/**
 * Repair v3: store the clean statement tree, then re-attach the quiz that
 * got detached (SetNull) when its thin-run parent topic was cascade-removed.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { extractSyllabus, flattenSyllabus } from "../src/lib/ai/syllabus";
import { storeDetectedTopics } from "../src/lib/syllabus-store";
import { noteContentHash } from "../src/lib/syllabus-hash";

const p = new PrismaClient();

const noteId = "cmwcenh1p0001to5s68uzyv7h";
const quizId = "cmwceunkt000pto5sgsn99de6";

const note = await p.note.findUnique({ where: { id: noteId } });
if (!note || !note.subjectId) throw new Error("note/subject missing");
const subjectId = note.subjectId;
const userId = note.userId;

// 1. Fixed extraction → store (fresh subject state, reuse-safe).
const extraction = await extractSyllabus(note.content, note.title);
console.log("engine:", extraction.engine, "| warnings:", extraction.warnings);
const rows = flattenSyllabus(extraction.nodes);
if (rows.length === 0) throw new Error("extraction empty");
const created = await storeDetectedTopics({ userId, subjectId, noteId, rows });
console.log("rows stored, created:", created);

await p.note.update({
  where: { id: noteId },
  data: {
    status: "completed",
    syllabusStatus: "detected",
    syllabusSourceHash: noteContentHash(note.content),
  },
});

// 2. Re-attach the orphaned quiz to the new chapter topic.
const chapter = await p.topic.findFirst({
  where: { subjectId, userId, kind: "chapter" },
  select: { id: true, name: true },
});
if (!chapter) throw new Error("chapter topic missing");
await p.quiz.update({ where: { id: quizId }, data: { topicId: chapter.id } });
console.log("quiz attached to:", chapter.id, chapter.name);

// 3. Verify final state.
const final = await p.topic.findMany({
  where: { subjectId, userId },
  select: {
    id: true,
    name: true,
    kind: true,
    status: true,
    approved: true,
    parentId: true,
  },
  orderBy: [{ position: "asc" }, { createdAt: "asc" }],
});
console.log("FINAL TREE:", JSON.stringify(final, null, 1));

const quiz = await p.quiz.findUnique({
  where: { id: quizId },
  select: { topicId: true, _count: { select: { attempts: true, questions: true } } },
});
console.log("QUIZ:", JSON.stringify(quiz));

await p.$disconnect();
