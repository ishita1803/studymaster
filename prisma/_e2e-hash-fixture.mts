/**
 * Hash-skip fixture: computes the same `syllabusSourceHash` the detect action
 * computes for the DEMO subject and stores it, so clicking "Re-detect all
 * documents" exercises the short-circuit path instead of a real extraction.
 * Demo account only — never touches the real user's subjects.
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();

function syllabusSourceHash(parts) {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part.id);
    hash.update("\u0000");
    hash.update(part.content.replace(/\r\n/g, "\n").trim());
    hash.update("\u0001");
  }
  return hash.digest("hex").slice(0, 40);
}

const user = await prisma.user.findUnique({ where: { email: "demo@studymaster.app" } });
if (!user) throw new Error("demo user missing");

const subject = await prisma.subject.findFirst({
  where: { userId: user.id },
  orderBy: { createdAt: "asc" },
});
if (!subject) throw new Error("no demo subject");

const notes = await prisma.note.findMany({
  where: { userId: user.id, subjectId: subject.id },
  orderBy: { createdAt: "asc" },
  select: { id: true, content: true },
});
const sources = notes
  .filter((note) => note.content.trim().length > 0)
  .map((note) => ({ id: note.id, content: note.content }));

const hash = syllabusSourceHash(sources);
await prisma.subject.update({
  where: { id: subject.id },
  data: { syllabusSourceHash: hash },
});
console.log("subject:", subject.name, "| stored hash:", hash, "| notes:", sources.length);
await prisma.$disconnect();
