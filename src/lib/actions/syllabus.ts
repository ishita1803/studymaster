"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { extractSyllabus, flattenSyllabus } from "@/lib/ai/syllabus";
import { generatePlanForUser } from "@/lib/plan-service";
import { storeDetectedTopics } from "@/lib/syllabus-store";
import { noteContentHash, syllabusSourceHash } from "@/lib/syllabus-hash";
import { clamp } from "@/lib/utils";

function refresh(noteId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/roadmap");
  revalidatePath("/notes");
  revalidatePath("/analytics");
  revalidatePath("/subjects");
  if (noteId) revalidatePath(`/notes/${noteId}`);
}

/**
 * Detects a syllabus from a note and stores it as an unapproved topic tree.
 * The roadmap ignores unapproved topics until the student approves the
 * detected structure, which prevents hallucinated content from being
 * scheduled automatically.
 */
export async function detectSyllabusAction(formData: FormData) {
  const userId = await requireUserId();
  const noteId = String(formData.get("noteId") ?? "");
  const note = await prisma.note.findFirst({
    where: { id: noteId, userId },
    include: { subject: { select: { id: true, name: true } } },
  });
  if (!note) redirect("/notes");
  if (note.content.trim().length < 40) {
    redirect(
      `/notes/${note.id}?error=${encodeURIComponent(
        "Add a little more text before detecting a syllabus.",
      )}`,
    );
  }

  // A note without a subject becomes the source of a new subject so the
  // detected syllabus has one shared home for roadmap, cards and quizzes.
  let subjectId = note.subjectId;
  if (!subjectId) {
    const subject = await prisma.subject.create({
      data: {
        userId,
        name: note.title.trim().slice(0, 60) || "Detected subject",
        color: "mint",
        syllabusApproved: false,
      },
    });
    subjectId = subject.id;
    await prisma.note.update({ where: { id: note.id }, data: { subjectId } });
  }

  await prisma.note.update({
    where: { id: note.id },
    data: {
      status: "identifying",
      syllabusStatus: "detected",
      processingError: "",
    },
  });

  // An unchanged note with an already-stored detection is never reprocessed.
  const contentHash = noteContentHash(note.content);
  const storedHashMatches =
    note.role === "syllabus" || note.role === "notes";
  void storedHashMatches;
  const storedHash = note.syllabusSourceHash;
  if (storedHash === contentHash) {
    const linked = await prisma.topic.count({
      where: { userId, noteId: note.id },
    });
    if (linked > 0) {
      await prisma.note.update({
        where: { id: note.id },
        data: { status: "completed", syllabusStatus: "detected" },
      });
      redirect(
        `/notes/${note.id}?syllabus=current&count=${linked}`,
      );
    }
  }

  let extraction;
  try {
    extraction = await extractSyllabus(
      note.content,
      note.subject?.name || note.title,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Syllabus detection failed.";
    await prisma.note.update({
      where: { id: note.id },
      data: {
        status: "failed",
        syllabusStatus: "failed",
        processingError: message.slice(0, 300),
      },
    });
    refresh(note.id);
    redirect(
      `/notes/${note.id}?error=${encodeURIComponent(
        "Nova could not read a syllabus from this note. Try adding clear headings or bullet points.",
      )}`,
    );
  }

  const rows = flattenSyllabus(extraction.nodes);
  if (rows.length === 0) {
    await prisma.note.update({
      where: { id: note.id },
      data: {
        status: "failed",
        syllabusStatus: "failed",
        processingError:
          extraction.warnings[0] ??
          "No clear chapters or topics were found in this note.",
      },
    });
    refresh(note.id);
    redirect(
      `/notes/${note.id}?error=${encodeURIComponent(
        extraction.warnings[0] ??
          "No clear chapters or topics were found. Add headings, numbered sections or bullet points.",
      )}`,
    );
  }

  // Re-detection replaces only untouched, unapproved topics from this note.
  // Approved topics and anything with real progress stay exactly where they are.
  // Existing topics from other documents are reused rather than duplicated.
  await storeDetectedTopics({
    userId,
    subjectId,
    noteId: note.id,
    rows,
  });

  await prisma.subject.update({
    where: { id: subjectId },
    data: { syllabusApproved: false },
  });
  await prisma.note.update({
    where: { id: note.id },
    data: { status: "completed", syllabusStatus: "detected", syllabusSourceHash: contentHash },
  });

  refresh(note.id);
  const leafCount = rows.filter((row) => row.kind !== "chapter").length;
  redirect(
    `/notes/${note.id}?syllabus=detected&count=${leafCount}&engine=${extraction.engine}`,
  );
}

/**
 * Detects one syllabus from every document attached to a subject. This is the
 * combined view: duplicate chapters/topics across files are merged into a
 * single shared tree, and the result still waits for approval.
 */
export async function detectSubjectSyllabusAction(formData: FormData) {
  const userId = await requireUserId();
  const subjectId = String(formData.get("subjectId") ?? "");
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, userId },
    select: { id: true, name: true },
  });
  if (!subject) redirect("/subjects");

  const notes = await prisma.note.findMany({
    where: { userId, subjectId },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, content: true },
  });
  const sources = notes
    .filter((note) => note.content.trim().length > 0)
    .map((note) => ({ id: note.id, content: note.content }));
  const content = sources
    .map((note) => `## ${notes.find((n) => n.id === note.id)?.title ?? ""}\n${note.content}`)
    .join("\n\n")
    .slice(0, 200_000);

  if (content.trim().length < 40) {
    redirect(
      `/subjects/${subjectId}?error=${encodeURIComponent(
        "Add a document or a few sentences before detecting a syllabus.",
      )}`,
    );
  }

  // Reprocessing the same unchanged documents can only produce the same
  // topics (after dedup), so skip the whole extraction when nothing changed.
  const sourceHash = syllabusSourceHash(sources);
  const subjectState = await prisma.subject.findFirst({
    where: { id: subjectId, userId },
    select: { syllabusSourceHash: true },
  });
  if (subjectState?.syllabusSourceHash === sourceHash) {
    const topicCount = await prisma.topic.count({
      where: { userId, subjectId },
    });
    if (topicCount > 0) {
      redirect(
        `/subjects/${subjectId}?syllabus=current&count=${topicCount}`,
      );
    }
  }

  let extraction;
  try {
    extraction = await extractSyllabus(content, subject.name);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Syllabus detection failed.";
    redirect(
      `/subjects/${subjectId}?error=${encodeURIComponent(
        message.slice(0, 240),
      )}`,
    );
  }

  const rows = flattenSyllabus(extraction.nodes);
  if (rows.length === 0) {
    redirect(
      `/subjects/${subjectId}?error=${encodeURIComponent(
        extraction.warnings[0] ??
          "No clear chapters or topics were found. Add headings, numbered sections or bullet points.",
      )}`,
    );
  }

  await storeDetectedTopics({ userId, subjectId, noteId: null, rows });
  await prisma.subject.update({
    where: { id: subjectId },
    data: { syllabusApproved: false, syllabusSourceHash: sourceHash },
  });

  refresh();
  revalidatePath(`/subjects/${subjectId}`);
  const leafCount = rows.filter((row) => row.kind !== "chapter").length;
  redirect(
    `/subjects/${subjectId}?syllabus=detected&count=${leafCount}&engine=${extraction.engine}`,
  );
}

/**
 * Approves every detected topic for a subject (or a single note) and rebuilds
 * the roadmap from the shared syllabus.
 */
export async function approveSyllabusAction(formData: FormData) {
  const userId = await requireUserId();
  const noteId = String(formData.get("noteId") ?? "") || null;
  let subjectId = String(formData.get("subjectId") ?? "") || null;

  if (noteId) {
    const note = await prisma.note.findFirst({
      where: { id: noteId, userId },
      select: { id: true, subjectId: true },
    });
    if (!note) redirect("/notes");
    subjectId = note.subjectId;
  }

  if (!subjectId) redirect("/roadmap");

  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, userId },
    select: { id: true },
  });
  if (!subject) redirect("/roadmap");

  await prisma.topic.updateMany({
    where: { userId, subjectId, approved: false },
    data: { approved: true },
  });
  await prisma.subject.update({
    where: { id: subjectId },
    data: { syllabusApproved: true },
  });
  if (noteId) {
    await prisma.note.update({
      where: { id: noteId },
      data: { syllabusStatus: "approved" },
    });
  }

  await generatePlanForUser(userId, { startDate: new Date() });
  refresh(noteId ?? undefined);

  if (noteId) {
    redirect(`/notes/${noteId}?syllabus=approved`);
  }
  redirect("/roadmap?syllabus=approved");
}

function allowedStatus(value: string) {
  return ["not_started", "in_progress", "studied", "revised", "mastered"].includes(
    value,
  )
    ? value
    : "not_started";
}

/** Edits one detected topic without touching the rest of the tree. */
export async function updateSyllabusTopicAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  const topic = await prisma.topic.findFirst({
    where: { id, userId },
    include: { subject: { select: { syllabusApproved: true } } },
  });
  if (!topic) return;

  const statusRaw = String(formData.get("status") ?? topic.status);
  const status = allowedStatus(statusRaw);
  const name = String(formData.get("name") ?? topic.name).trim().slice(0, 80);

  await prisma.topic.update({
    where: { id },
    data: {
      name: name || topic.name,
      status,
      difficulty: clamp(Number(formData.get("difficulty") ?? topic.difficulty), 1, 5),
      importance: clamp(Number(formData.get("importance") ?? topic.importance), 1, 5),
      estimatedMinutes: clamp(
        Number(formData.get("estimatedMinutes") ?? topic.estimatedMinutes),
        15,
        600,
      ),
      masteryScore:
        status === "mastered"
          ? Math.max(topic.masteryScore, 90)
          : topic.masteryScore,
      lastStudiedAt: status === "not_started" ? topic.lastStudiedAt : new Date(),
    },
  });

  if (topic.subject.syllabusApproved) {
    await generatePlanForUser(userId, { startDate: new Date() });
  }
  refresh();
}

/** Adds a manual topic. Manual topics are approved immediately. */
export async function addSyllabusTopicAction(formData: FormData) {
  const userId = await requireUserId();
  const subjectId = String(formData.get("subjectId") ?? "");
  const noteId = String(formData.get("noteId") ?? "") || null;
  const parentId = String(formData.get("parentId") ?? "") || null;
  const name = String(formData.get("name") ?? "").trim();

  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, userId },
    select: { id: true, syllabusApproved: true },
  });
  if (!subject || !name) return;

  let chapter = String(formData.get("chapter") ?? "").trim().slice(0, 80);
  if (parentId) {
    const parent = await prisma.topic.findFirst({
      where: { id: parentId, userId },
      select: { name: true },
    });
    if (parent) chapter = parent.name;
  }

  const siblings = await prisma.topic.count({
    where: { userId, subjectId, parentId },
  });

  await prisma.topic.create({
    data: {
      userId,
      subjectId,
      noteId,
      parentId,
      name: name.slice(0, 80),
      chapter,
      kind: String(formData.get("kind") ?? "topic"),
      sourceRef: "Added manually",
      position: siblings,
      approved: true,
      difficulty: clamp(Number(formData.get("difficulty") ?? 3), 1, 5),
      importance: clamp(Number(formData.get("importance") ?? 3), 1, 5),
      estimatedMinutes: clamp(
        Number(formData.get("estimatedMinutes") ?? 45),
        15,
        600,
      ),
    },
  });

  await generatePlanForUser(userId, { startDate: new Date() });
  refresh(noteId ?? undefined);
}

/** Removes a topic and its children. Completed history stays in the plan. */
export async function deleteSyllabusTopicAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  const topic = await prisma.topic.findFirst({
    where: { id, userId },
    include: { subject: { select: { syllabusApproved: true } } },
  });
  if (!topic) return;

  await prisma.topic.deleteMany({ where: { id, userId } });
  if (topic.subject.syllabusApproved) {
    await generatePlanForUser(userId, { startDate: new Date() });
  }
  refresh();
}

/** Moves a topic up or down among its siblings. */
export async function moveSyllabusTopicAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  const direction = String(formData.get("direction") ?? "up") === "down" ? 1 : -1;

  const topic = await prisma.topic.findFirst({
    where: { id, userId },
    select: {
      id: true,
      subjectId: true,
      parentId: true,
      position: true,
    },
  });
  if (!topic) return;

  const siblings = await prisma.topic.findMany({
    where: { userId, subjectId: topic.subjectId, parentId: topic.parentId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, position: true },
  });

  const index = siblings.findIndex((entry) => entry.id === topic.id);
  const swapWith = index + direction;
  if (index < 0 || swapWith < 0 || swapWith >= siblings.length) return;

  await prisma.$transaction([
    prisma.topic.update({
      where: { id: siblings[index].id },
      data: { position: siblings[swapWith].position },
    }),
    prisma.topic.update({
      where: { id: siblings[swapWith].id },
      data: { position: siblings[index].position },
    }),
  ]);

  const subject = await prisma.subject.findFirst({
    where: { id: topic.subjectId, userId },
    select: { syllabusApproved: true },
  });
  if (subject?.syllabusApproved) {
    await generatePlanForUser(userId, { startDate: new Date() });
  }
  refresh();
}

/**
 * Merges one topic (source) into another (target): the source's children move
 * under the target and every related record (quizzes, flashcards, exam-topic
 * selections, roadmap blocks, focus sessions, generation jobs) is re-pointed
 * to the target, so nothing is lost when the duplicate disappears.
 */
export async function mergeSyllabusTopicsAction(formData: FormData) {
  const userId = await requireUserId();
  const sourceId = String(formData.get("sourceId") ?? "");
  const targetId = String(formData.get("targetId") ?? "");
  if (!sourceId || !targetId || sourceId === targetId) return;

  const [source, target] = await Promise.all([
    prisma.topic.findFirst({ where: { id: sourceId, userId } }),
    prisma.topic.findFirst({
      where: { id: targetId, userId },
      select: { id: true, subjectId: true },
    }),
  ]);
  if (!source || !target || source.subjectId !== target.subjectId) return;

  // The target must not sit inside the source's own subtree — folding a
  // chapter into its own child would create a parent loop.
  const subtree = new Set<string>([sourceId]);
  let frontier = [sourceId];
  while (frontier.length > 0) {
    const children = await prisma.topic.findMany({
      where: { userId, parentId: { in: frontier } },
      select: { id: true, parentId: true },
    });
    frontier = children
      .map((child) => child.id)
      .filter((id) => !subtree.has(id));
    frontier.forEach((id) => subtree.add(id));
  }
  if (subtree.has(targetId)) return;

  // Re-home the source's children under the target, after the target's
  // existing children.
  const children = await prisma.topic.findMany({
    where: { userId, parentId: sourceId },
    select: { id: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  const childCount = await prisma.topic.count({
    where: { userId, parentId: targetId },
  });
  await prisma.$transaction([
    prisma.topic.updateMany({
      where: { id: { in: children.map((child) => child.id) }, userId },
      data: {
        parentId: targetId,
        position: 0,
      },
    }),
    ...children.map((child, index) =>
      prisma.topic.update({
        where: { id: child.id },
        data: { position: childCount + index },
      }),
    ),
  ]);

  // Exam selections: drop source rows that the target already has (the
  // [examId, topicId] pair is unique), then move the rest.
  const sourceExamTopics = await prisma.examTopic.findMany({
    where: { topicId: sourceId },
    select: { examId: true },
  });
  const targetExamTopics = await prisma.examTopic.findMany({
    where: { topicId: targetId },
    select: { examId: true },
  });
  const targetExams = new Set(targetExamTopics.map((entry) => entry.examId));
  const duplicateExamIds = sourceExamTopics
    .map((entry) => entry.examId)
    .filter((examId) => targetExams.has(examId));
  await prisma.examTopic.deleteMany({
    where: { topicId: sourceId, examId: { in: duplicateExamIds } },
  });
  await prisma.examTopic.updateMany({
    where: { topicId: sourceId },
    data: { topicId: targetId },
  });

  // Quizzes, flashcards, roadmap blocks, focus sessions and generation jobs
  // all simply follow the surviving topic; their history is preserved.
  await prisma.planItem.updateMany({
    where: { topicId: sourceId },
    data: { topicId: targetId },
  });
  await prisma.quiz.updateMany({
    where: { topicId: sourceId },
    data: { topicId: targetId },
  });
  await prisma.flashcard.updateMany({
    where: { topicId: sourceId },
    data: { topicId: targetId },
  });
  await prisma.focusSession.updateMany({
    where: { topicId: sourceId },
    data: { topicId: targetId },
  });
  await prisma.generationJob.updateMany({
    where: { topicId: sourceId },
    data: { topicId: targetId },
  });

  await prisma.topic.delete({ where: { id: sourceId } });

  const subject = await prisma.subject.findFirst({
    where: { id: target.subjectId, userId },
    select: { syllabusApproved: true },
  });
  if (subject?.syllabusApproved) {
    await generatePlanForUser(userId, { startDate: new Date() });
  }
  refresh();
}
