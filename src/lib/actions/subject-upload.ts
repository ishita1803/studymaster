"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { extractSyllabus, flattenSyllabus } from "@/lib/ai/syllabus";
import { fileTitle, readUploadedText } from "@/lib/files/extract";
import { storeDetectedTopics } from "@/lib/syllabus-store";
import { noteContentHash, syllabusSourceHash } from "@/lib/syllabus-hash";
import { matchTopicIdFromText } from "@/lib/topic-feedback";

export type SubjectUploadState = { error?: string };

function sourceKindFor(method: string | null | undefined) {
  if (method === "pdf" || method === "pdf-ocr") return "pdf";
  if (method === "docx") return "docx";
  if (method === "image-ocr") return "image";
  return "text";
}

function refresh(subjectId: string, noteId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/roadmap");
  revalidatePath("/notes");
  revalidatePath("/analytics");
  revalidatePath("/subjects");
  revalidatePath(`/subjects/${subjectId}`);
  if (noteId) revalidatePath(`/notes/${noteId}`);
}

/**
 * Matches a note's title/content against the subject's approved syllabus and
 * links the note to the best-fitting topic, so the Notes section shows where
 * a note belongs. Association only ever uses the approved syllabus — the
 * single source of truth — and never creates or changes topics.
 */
async function associateNoteWithTopics(
  userId: string,
  note: {
    id: string;
    title: string;
    content: string;
    subjectId: string | null;
  },
) {
  if (!note.subjectId) return;
  const topics = await prisma.topic.findMany({
    where: {
      userId,
      subjectId: note.subjectId,
      approved: true,
    },
    select: { id: true, name: true, masteryScore: true },
  });
  if (topics.length === 0) return;

  const topicId = matchTopicIdFromText(
    note.title,
    `${note.title}\n${note.content.slice(0, 8_000)}`,
    topics,
    null,
  );
  if (topicId) {
    await prisma.note.update({
      where: { id: note.id },
      data: { topicId },
    });
  }
}

/**
 * Uploads one OFFICIAL SYLLABUS document into a subject and extracts the
 * editable chapter → topic → subtopic tree from it. Only documents uploaded
 * through this entry point may propose topics; lecture notes never touch the
 * syllabus or the roadmap.
 */
export async function uploadOfficialSyllabusAction(
  _previous: SubjectUploadState,
  formData: FormData,
): Promise<SubjectUploadState> {
  const userId = await requireUserId();
  const subjectId = String(formData.get("subjectId") ?? "");

  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, userId },
    select: { id: true, name: true },
  });
  if (!subject) return { error: "That subject could not be found." };

  const upload = await readUploadedText(formData);
  if (upload.error) return { error: upload.error };

  const pasted = String(formData.get("content") ?? "").trim();
  const content = [pasted, upload.text].filter(Boolean).join("\n\n").trim();

  if (!upload.fileName && !pasted) {
    return { error: "Choose a PDF, photo or document, or paste the official syllabus first." };
  }
  if (content.length < 40) {
    return {
      error:
        "Nova could not read enough text from that file. Try a clearer scan or photo, or paste the syllabus text so the topics can be extracted.",
    };
  }

  const title =
    String(formData.get("title") ?? "").trim() ||
    fileTitle(upload.fileName) ||
    "Official syllabus";

  const note = await prisma.note.create({
    data: {
      userId,
      subjectId: subject.id,
      title: title.slice(0, 120),
      content,
      status: "identifying",
      syllabusStatus: "none",
      role: "syllabus",
      sourceKind: sourceKindFor(upload.method),
      pages: upload.pages ?? null,
      skippedPages: upload.skippedPages ?? null,
      ocr: upload.ocr,
      processingError: "",
    },
  });

  let extraction;
  try {
    extraction = await extractSyllabus(content, subject.name);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Syllabus extraction failed.";
    await prisma.note.update({
      where: { id: note.id },
      data: {
        status: "failed",
        syllabusStatus: "failed",
        processingError: message.slice(0, 300),
      },
    });
    refresh(subject.id, note.id);
    redirect(
      `/subjects/${subject.id}?uploaded=1&error=${encodeURIComponent(
        "The file uploaded, but Nova could not extract a syllabus. Open the document to review the text, then re-detect.",
      )}`,
    );
  }

  const rows = flattenSyllabus(extraction.nodes);
  if (rows.length === 0) {
    const warning =
      extraction.warnings[0] ??
      "No clear chapters or topics were found in this document.";
    await prisma.note.update({
      where: { id: note.id },
      data: {
        status: "failed",
        syllabusStatus: "failed",
        processingError: warning.slice(0, 300),
      },
    });
    refresh(subject.id, note.id);
    redirect(
      `/subjects/${subject.id}?uploaded=1&error=${encodeURIComponent(
        `The file uploaded, but ${warning} You can edit the text or re-detect it from the subject page.`,
      )}`,
    );
  }

  await storeDetectedTopics({
    userId,
    subjectId: subject.id,
    noteId: note.id,
    rows,
  });
  await prisma.subject.update({
    where: { id: subject.id },
    data: {
      syllabusApproved: false,
      syllabusSourceHash: syllabusSourceHash([{ id: note.id, content }]),
    },
  });
  await prisma.note.update({
    where: { id: note.id },
    data: {
      status: "completed",
      syllabusStatus: "detected",
      processingError: "",
      syllabusSourceHash: noteContentHash(content),
    },
  });

  const chapterCount = rows.filter((r) => r.kind === "chapter").length;
  const topicCount = rows.filter((r) => r.kind === "topic").length;
  const subtopicCount = rows.filter((r) => r.kind !== "chapter" && r.kind !== "topic").length;
  const totalChunks = Math.ceil(content.length / 7000);

  const report = await prisma.extractionReport.create({
    data: {
      userId,
      subjectId: subject.id,
      documentName: upload.fileName || title,
      totalPages: upload.pages ?? 1,
      processedPages: (upload.pages ?? 1) - (upload.skippedPages ?? 0),
      skippedPages: upload.skippedPages ?? 0,
      totalChunks,
      chapters: chapterCount,
      topics: topicCount,
      subtopics: subtopicCount,
      status: (upload.skippedPages ?? 0) > 0 ? "partial" : "complete",
    },
  });

  refresh(subject.id, note.id);

  const leafCount = rows.filter((row) => row.kind !== "chapter").length;
  const partial =
    upload.skippedPages && upload.skippedPages > 0
      ? `&pages=${upload.pages ?? ""}&skipped=${upload.skippedPages}`
      : "";

  redirect(
    `/subjects/${subject.id}?uploaded=1&syllabus=detected&count=${leafCount}&engine=${extraction.engine}&reportId=${report.id}${partial}`,
  );
}

/**
 * Uploads a LECTURE NOTE into a subject without any syllabus extraction.
 * Notes are study material for cards and quizzes — they can never modify the
 * syllabus tree or the roadmap.
 */
export async function uploadSubjectNoteAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const subjectId = String(formData.get("subjectId") ?? "");
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, userId },
    select: { id: true },
  });
  if (!subject) redirect("/subjects");

  const upload = await readUploadedText(formData);
  if (upload.error) {
    redirect(`/subjects/${subject.id}?error=${encodeURIComponent(upload.error)}`);
  }

  const pasted = String(formData.get("content") ?? "").trim();
  const content = [pasted, upload.text].filter(Boolean).join("\n\n").trim();

  if (!upload.fileName && !pasted) {
    redirect(
      `/subjects/${subject.id}?error=${encodeURIComponent(
        "Choose a PDF, photo or document, or paste some text first.",
      )}`,
    );
  }
  if (content.length < 40) {
    redirect(
      `/subjects/${subject.id}?error=${encodeURIComponent(
        "Nova could not read enough text from that file. Try a clearer scan or photo, or paste the text.",
      )}`,
    );
  }

  const title =
    String(formData.get("title") ?? "").trim() ||
    fileTitle(upload.fileName) ||
    "Lecture notes";

  const note = await prisma.note.create({
    data: {
      userId,
      subjectId: subject.id,
      title: title.slice(0, 120),
      content,
      status: "completed",
      syllabusStatus: "none",
      role: "notes",
      sourceKind: sourceKindFor(upload.method),
      pages: upload.pages ?? null,
      skippedPages: upload.skippedPages ?? null,
      ocr: upload.ocr,
      processingError: "",
    },
  });

  await associateNoteWithTopics(userId, {
    id: note.id,
    title: note.title,
    content,
    subjectId: subject.id,
  });

  refresh(subject.id, note.id);
  redirect(`/subjects/${subject.id}?note=added`);
}

/** Removes one lecture note from the Notes section (subject's files stay). */
export async function deleteSubjectNoteAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  const note = await prisma.note.findFirst({
    where: { id, userId },
    select: { id: true, subjectId: true },
  });
  if (!note) return;

  await prisma.note.deleteMany({ where: { id, userId } });
  if (note.subjectId) {
    refresh(note.subjectId);
    redirect(`/subjects/${note.subjectId}?note=deleted`);
  }
  redirect("/notes?deleted=1");
}
