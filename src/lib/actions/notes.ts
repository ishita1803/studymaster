"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { makeFlashcards, makeQuiz, summarizeNotes } from "@/lib/ai/study-tools";
import { InsufficientMaterialError } from "@/lib/ai/content-study";
import { fileTitle, readUploadedText } from "@/lib/files/extract";
import { clamp } from "@/lib/utils";

export type SummaryState = { text?: string; error?: string };

function sourceKindFor(method: string | null | undefined) {
  if (method === "pdf" || method === "pdf-ocr") return "pdf";
  if (method === "docx") return "docx";
  if (method === "image-ocr") return "image";
  return "text";
}

export async function createNoteAction(formData: FormData) {
  const userId = await requireUserId();
  const upload = await readUploadedText(formData);
  if (upload.error) {
    redirect(`/notes?error=${encodeURIComponent(upload.error)}`);
  }

  const pasted = String(formData.get("content") ?? "").trim();
  const content = [pasted, upload.text].filter(Boolean).join("\n\n").trim();
  const title =
    String(formData.get("title") ?? "").trim() ||
    fileTitle(upload.fileName) ||
    "Untitled note";
  const subjectIdRaw = String(formData.get("subjectId") ?? "") || null;

  let subjectId: string | null = null;
  if (subjectIdRaw) {
    const subject = await prisma.subject.findFirst({ where: { id: subjectIdRaw, userId } });
    if (subject) subjectId = subject.id;
  }

  const note = await prisma.note.create({
    data: {
      userId,
      title: title.slice(0, 120),
      content,
      subjectId,
      status: upload.fileName ? "completed" : "ready",
      sourceKind: sourceKindFor(upload.method),
      pages: upload.pages ?? null,
      skippedPages: upload.skippedPages ?? null,
      ocr: upload.ocr,
      processingError: "",
    },
  });

  const partial =
    upload.skippedPages && upload.skippedPages > 0
      ? `&pages=${upload.pages ?? ""}&skipped=${upload.skippedPages}`
      : "";

  revalidatePath("/notes");
  redirect(`/notes/${note.id}${upload.ocr ? `?ocr=1${partial}` : ""}`);
}

export async function updateNoteAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  const note = await prisma.note.findFirst({ where: { id, userId } });
  if (!note) return;

  const subjectIdRaw = String(formData.get("subjectId") ?? "") || null;
  let subjectId: string | null = null;
  if (subjectIdRaw) {
    const subject = await prisma.subject.findFirst({ where: { id: subjectIdRaw, userId } });
    if (subject) subjectId = subject.id;
  }

  const upload = await readUploadedText(formData);
  if (upload.error) {
    redirect(`/notes/${id}?error=${encodeURIComponent(upload.error)}`);
  }

  const pasted = String(formData.get("content") ?? note.content);
  const content = upload.text ? [pasted.trim(), upload.text].filter(Boolean).join("\n\n") : pasted;

  await prisma.note.update({
    where: { id },
    data: {
      title: String(formData.get("title") ?? note.title).trim().slice(0, 120) || note.title,
      content,
      subjectId,
      ...(upload.fileName
        ? {
            status: "completed",
            sourceKind: sourceKindFor(upload.method),
            pages: upload.pages ?? note.pages,
            skippedPages: upload.skippedPages ?? note.skippedPages,
            ocr: upload.ocr || note.ocr,
            processingError: "",
          }
        : {}),
    },
  });

  revalidatePath(`/notes/${id}`);
  revalidatePath("/notes");
  if (upload.ocr) {
    const partial =
      upload.skippedPages && upload.skippedPages > 0
        ? `&pages=${upload.pages ?? ""}&skipped=${upload.skippedPages}`
        : "";
    redirect(`/notes/${id}?ocr=1${partial}`);
  }
}

export async function deleteNoteAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  await prisma.note.deleteMany({ where: { id, userId } });
  revalidatePath("/notes");
  redirect("/notes");
}

export async function summarizeNoteAction(
  _previous: SummaryState,
  formData: FormData,
): Promise<SummaryState> {
  const userId = await requireUserId();
  const noteId = String(formData.get("noteId") ?? "");
  const note = await prisma.note.findFirst({ where: { id: noteId, userId } });
  if (!note) return { error: "Note not found." };
  if (note.content.trim().length < 40) {
    return { error: "Add a little more content to your note first." };
  }

  const text = await summarizeNotes(note.title, note.content);
  return { text };
}

export async function cardsFromNoteAction(formData: FormData) {
  const userId = await requireUserId();
  const noteId = String(formData.get("noteId") ?? "");
  const count = clamp(Number(formData.get("count") ?? 8), 1, 20);

  const note = await prisma.note.findFirst({ where: { id: noteId, userId } });
  if (!note) redirect("/notes");
  if (note.content.trim().length < 40) {
    redirect("/flashcards?error=note-empty");
  }

  let cards;
  try {
    cards = await makeFlashcards(
      `${note.title}\n\n${note.content}`,
      count,
      note.title,
    );
  } catch (error) {
    // The mandatory content-understanding stage rejected the material.
    if (error instanceof InsufficientMaterialError) {
      redirect(`/flashcards?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  if (cards.length === 0) {
    redirect("/flashcards?error=no-cards");
  }

  await prisma.flashcard.createMany({
    data: cards.map((card) => ({
      userId,
      front: card.front.slice(0, 600),
      back: card.back.slice(0, 1200),
      noteId: note.id,
      subjectId: note.subjectId,
      source: "notes",
      format: card.format,
      topicLabel: card.topicLabel,
      sourceRef: card.sourceRef,
      difficulty: card.difficulty,
      dueAt: new Date(),
    })),
  });

  revalidatePath("/flashcards");
  revalidatePath("/dashboard");
  redirect(`/flashcards?created=${cards.length}`);
}

export async function quizFromNoteAction(formData: FormData) {
  const userId = await requireUserId();
  const noteId = String(formData.get("noteId") ?? "");
  const count = clamp(Number(formData.get("count") ?? 5), 1, 15);

  const note = await prisma.note.findFirst({ where: { id: noteId, userId } });
  if (!note) redirect("/notes");
  if (note.content.trim().length < 40) {
    redirect(
      `/notes/${note.id}?error=${encodeURIComponent(
        "Add a few sentences to this note before generating a quiz.",
      )}`,
    );
  }

  let questions;
  try {
    questions = await makeQuiz(`${note.title}\n\n${note.content}`, count, note.title);
  } catch (error) {
    // The mandatory content-understanding stage rejected the material.
    if (error instanceof InsufficientMaterialError) {
      redirect(`/notes/${note.id}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  if (questions.length === 0) {
    redirect(
      `/notes/${note.id}?error=${encodeURIComponent(
        "Nova could not build clear questions from that note. Try adding a little more detail.",
      )}`,
    );
  }

  const quiz = await prisma.quiz.create({
    data: {
      userId,
      title: `${note.title} · quiz`,
      description: `Generated from the note “${note.title}”`,
      subjectId: note.subjectId,
      noteId: note.id,
      source: "notes",
      difficulty: "medium",
      timeLimitSec: questions.length * 90,
      questions: {
        create: questions.map((question, index) => ({
          type: question.type,
          format: question.format,
          topicLabel: question.topicLabel,
          sourceRef: question.sourceRef,
          difficulty: question.difficulty,
          prompt: question.prompt,
          options: JSON.stringify(question.options),
          correctAnswer: question.correctAnswer,
          explanation: question.explanation,
          order: index,
        })),
      },
    },
  });

  revalidatePath("/quizzes");
  redirect(`/quizzes/${quiz.id}`);
}
