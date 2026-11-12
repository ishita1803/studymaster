"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { makeQuiz, type Difficulty, type QuizFormat } from "@/lib/ai/study-tools";
import { InsufficientMaterialError } from "@/lib/ai/content-study";
import { fileTitle, readUploadedText } from "@/lib/files/extract";
import { isAnswerCorrect } from "@/lib/quiz";
import {
  QUIZ_QUESTION_TYPES,
  matchPairProblem,
  mcqOptionProblem,
  normalizeQuizQuestions,
  parseMatchPairs,
  questionTypeLabel,
  type QuizQuestionType,
} from "@/lib/quiz-rules";
import {
  blendMastery,
  bucketTopicResults,
  matchTopicIdFromText,
  statusForAccuracy,
} from "@/lib/topic-feedback";
import { loadSubjectDocuments } from "@/lib/subject-documents";
import {
  awardXp,
  evaluateAchievements,
  syncDailyGoal,
  touchStreak,
  XP_RULES,
} from "@/lib/gamification";
import { clamp } from "@/lib/utils";

export type QuizFormState = { error?: string };

const QUIZ_FORMATS: QuizFormat[] = [
  "conceptual",
  "definition",
  "application",
  "scenario",
  "comparison",
  "problem",
  "formula",
  "factual",
];

const QUESTION_TYPES: QuizQuestionType[] = QUIZ_QUESTION_TYPES;

function readDifficulty(raw: FormDataEntryValue | null): Difficulty {
  const value = String(raw ?? "medium").toLowerCase();
  return value === "easy" || value === "hard" ? value : "medium";
}

function readFormats(formData: FormData): QuizFormat[] {
  const raw = formData.getAll("formats").map((value) => String(value));
  const list = raw.length
    ? raw
    : String(formData.get("formats") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
  const valid = list.filter((value): value is QuizFormat =>
    QUIZ_FORMATS.includes(value as QuizFormat),
  );
  return valid.length > 0 ? valid : QUIZ_FORMATS;
}

function readQuestionTypes(formData: FormData): QuizQuestionType[] {
  const raw = formData.getAll("questionTypes").map((value) => String(value));
  const list = raw.length
    ? raw
    : String(formData.get("questionTypes") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
  const valid = list.filter((value): value is QuizQuestionType =>
    QUESTION_TYPES.includes(value as QuizQuestionType),
  );
  return valid;
}

type QuestionInput = {
  type?: string;
  prompt?: string;
  options?: unknown;
  correctAnswer?: string;
  explanation?: string;
  pairs?: unknown;
};

function sanitizeQuestions(raw: unknown) {
  return normalizeQuizQuestions(raw, 40).map((question, index) => ({
    ...question,
    order: index,
  }));
}

function hasInvalidMultipleChoice(raw: unknown) {
  if (!Array.isArray(raw)) return false;

  return raw.slice(0, 40).some((entry) => {
    const question = entry as QuestionInput;
    if (question?.type !== "mcq") return false;
    const options = Array.isArray(question.options)
      ? question.options.map((option) => String(option))
      : [];
    return Boolean(mcqOptionProblem(options, String(question.correctAnswer ?? "")));
  });
}

function hasInvalidMatch(raw: unknown) {
  if (!Array.isArray(raw)) return false;

  return raw.slice(0, 40).some((entry) => {
    const question = entry as QuestionInput;
    if (question?.type !== "match") return false;
    const pairs = parseMatchPairs(question.pairs ?? question.correctAnswer);
    return Boolean(matchPairProblem(pairs));
  });
}

async function resolveContext(userId: string, subjectId: string | null, topicId: string | null) {
  let subject = null;
  let topic = null;

  if (subjectId) {
    subject = await prisma.subject.findFirst({
      where: { id: subjectId, userId },
      // The approved syllabus is the single source of truth: generated
      // material only links to topics the student actually approved.
      include: { topics: { where: { approved: true }, select: { id: true, name: true } } },
    });
  }

  if (topicId) {
    topic = await prisma.topic.findFirst({
      where: { id: topicId, userId },
      include: {
        subject: {
          include: { topics: { where: { approved: true }, select: { id: true, name: true } } },
        },
      },
    });
    if (topic) subject = topic.subject;
  }

  return { subject, topic };
}

export async function createQuizAction(
  _previous: QuizFormState,
  formData: FormData,
): Promise<QuizFormState> {
  const userId = await requireUserId();

  const title = String(formData.get("title") ?? "").trim();
  const subjectIdRaw = String(formData.get("subjectId") ?? "") || null;
  const topicIdRaw = String(formData.get("topicId") ?? "") || null;
  const timeLimitRaw = Number(formData.get("timeLimit") ?? 0);

  let parsed: unknown = [];
  try {
    parsed = JSON.parse(String(formData.get("questions") ?? "[]"));
  } catch {
    return { error: "The question list could not be read. Try adding them again." };
  }

  const rawList = Array.isArray(parsed) ? parsed.slice(0, 40) : [];
  if (hasInvalidMultipleChoice(rawList)) {
    return {
      error:
        "Every multiple-choice question needs at least 4 unique options with the correct answer selected.",
    };
  }
  if (hasInvalidMatch(rawList)) {
    return {
      error:
        "Every matching question needs at least 2 complete pairs with unique left items and unique right options.",
    };
  }

  const questions = sanitizeQuestions(rawList);
  if (!title) return { error: "Give your quiz a title." };
  if (questions.length === 0) {
    return { error: "Add at least one question with a prompt and a correct answer." };
  }

  const { subject, topic } = await resolveContext(userId, subjectIdRaw, topicIdRaw);
  const difficulty = readDifficulty(formData.get("difficulty"));

  const quiz = await prisma.quiz.create({
    data: {
      userId,
      title: title.slice(0, 90),
      subjectId: subject?.id ?? null,
      topicId: topic?.id ?? null,
      difficulty,
      questionTypes: JSON.stringify(
        [...new Set(questions.map((question) => question.type))],
      ),
      timeLimitSec:
        Number.isFinite(timeLimitRaw) && timeLimitRaw > 0
          ? clamp(Math.round(timeLimitRaw), 60, 7200)
          : null,
      source: "manual",
      questions: {
        create: questions.map((question) => ({
          type: question.type,
          prompt: question.prompt,
          options: JSON.stringify(question.options),
          correctAnswer: question.correctAnswer,
          explanation: question.explanation,
          order: question.order,
        })),
      },
    },
  });

  revalidatePath("/quizzes");
  redirect(`/quizzes/${quiz.id}`);
}

export async function generateQuizAction(
  _previous: QuizFormState,
  formData: FormData,
): Promise<QuizFormState> {
  const userId = await requireUserId();

  const subjectIdRaw = String(formData.get("subjectId") ?? "") || null;
  const topicIdRaw = String(formData.get("topicId") ?? "") || null;
  const noteId = String(formData.get("noteId") ?? "") || null;
  const upload = await readUploadedText(formData);
  if (upload.error) return { error: upload.error };

  const pasted = [String(formData.get("source") ?? "").trim(), upload.text]
    .filter(Boolean)
    .join("\n\n");
  const count = clamp(Number(formData.get("count") ?? 5), 1, 20);
  const difficulty = readDifficulty(formData.get("difficulty"));
  const formats = readFormats(formData);
  const questionTypes = readQuestionTypes(formData);
  if (questionTypes.length === 0) {
    return { error: "Select at least one answer type before generating a quiz." };
  }
  const titleInput =
    String(formData.get("title") ?? "").trim() || fileTitle(upload.fileName);

  const { subject, topic } = await resolveContext(userId, subjectIdRaw, topicIdRaw);

  let source = pasted;
  let noteTitle = "";
  let noteContentLength = 0;

  if (noteId) {
    const note = await prisma.note.findFirst({ where: { id: noteId, userId } });
    if (note) {
      source = [note.title, note.content, pasted].filter(Boolean).join("\n\n");
      noteTitle = note.title;
      noteContentLength = note.content.trim().length;
    }
  }

  if (noteId && noteContentLength < 40 && pasted.trim().length < 40) {
    return {
      error:
        "That note does not have enough text yet. Add a few sentences (or a clearer scan) and try again.",
    };
  }

  if (!source) {
    // A subject or topic name is not study material. Read the subject's
    // uploaded documents so generation is grounded in real content instead
    // of producing unanswerable questions from bare topic labels.
    if (subject) {
      const documents = await loadSubjectDocuments(userId, subject.id);
      if (documents.text) source = documents.text;
    }
  }

  if (!source) {
    // A subject or topic name is not study material — asking Gemini to write
    // questions from bare labels produces invented answers and wastes quota.
    // The local generator (which never invents) already refuses bare names,
    // so the honest move is to stop here and ask for real material.
    return {
      error:
        "Add real material first: link a note, upload its PDF, or paste the text you want to be quizzed on.",
    };
  }

  const context = [subject?.name, topic?.name, noteTitle].filter(Boolean).join(" · ");
  let generated;
  try {
    generated = await makeQuiz(source, count, context, {
      difficulty,
      formats,
      questionTypes,
      focusTopics: topic ? [topic.name] : undefined,
    });
  } catch (error) {
    // The mandatory content-understanding stage rejected the material.
    if (error instanceof InsufficientMaterialError) {
      return { error: error.message };
    }
    throw error;
  }

  if (generated.length === 0) {
    return {
      error:
        "Nova couldn't build questions from that material for the answer types you picked. Try adding more detail, or choose different answer types.",
    };
  }

  // Attach every generated question to a real syllabus topic when possible.
  // The label is replaced with the matched topic name so results update the
  // same shared topic the roadmap and analytics use.
  const topicCandidates =
    subject?.topics.map((entry) => ({
      id: entry.id,
      name: entry.name,
      masteryScore: 0,
    })) ?? [];
  const linked = generated.map((question) => {
    const topicId = matchTopicIdFromText(
      question.topicLabel,
      `${question.prompt} ${question.correctAnswer}`,
      topicCandidates,
      topic?.id ?? null,
    );
    const matched = topicId
      ? topicCandidates.find((candidate) => candidate.id === topicId)
      : null;
    return {
      ...question,
      topicId,
      topicLabel: matched?.name ?? question.topicLabel,
    };
  });

  // Report requested types that the material could not support instead of
  // silently substituting a different type.
  const producedTypes = [...new Set(linked.map((question) => question.type))];
  const missingTypes = questionTypes.filter((type) => !producedTypes.includes(type));
  const notice =
    missingTypes.length > 0
      ? `The material could not support ${missingTypes
          .map((type) => questionTypeLabel(type))
          .join(", ")}. Only the generated types are included.`
      : "";

  const quiz = await prisma.quiz.create({
    data: {
      userId,
      title:
        titleInput ||
        `${topic?.name ?? subject?.name ?? "Study"} · practice quiz`,
      description: context ? `Generated from ${context}` : "Generated by Nova",
      subjectId: subject?.id ?? null,
      topicId: topic?.id ?? null,
      noteId,
      source: "ai",
      difficulty,
      questionTypes: JSON.stringify(producedTypes),
      timeLimitSec: generated.length * 90,
      questions: {
        create: linked.map((question, index) => ({
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
  const params = new URLSearchParams();
  if (upload.ocr) params.set("ocr", "1");
  if (upload.skippedPages && upload.skippedPages > 0) {
    params.set("pages", String(upload.pages ?? ""));
    params.set("skipped", String(upload.skippedPages));
  }
  if (notice) params.set("notice", notice);
  const queryString = params.toString();
  redirect(`/quizzes/${quiz.id}${queryString ? `?${queryString}` : ""}`);
}

/**
 * Feeds quiz results back into the shared syllabus. Each question carries a
 * topicLabel from generation, so a mixed quiz can move several topics at once
 * instead of only the quiz-level topic. Mastery is a weighted average so one
 * bad attempt lowers it without erasing prior progress.
 */
async function applyTopicResults(
  userId: string,
  quiz: { subjectId: string | null; topicId: string | null },
  results: { question: { topicLabel: string }; correct: boolean }[],
) {
  const topics = await prisma.topic.findMany({
    where: { userId, ...(quiz.subjectId ? { subjectId: quiz.subjectId } : {}) },
    select: { id: true, name: true, masteryScore: true },
  });
  if (topics.length === 0) return;

  const buckets = bucketTopicResults(
    results.map((result) => ({
      topicLabel: result.question.topicLabel,
      correct: result.correct,
    })),
    topics,
    quiz.topicId,
  );

  for (const bucket of buckets) {
    const topic = topics.find((entry) => entry.id === bucket.topicId);
    if (!topic) continue;
    const accuracy = Math.round((bucket.correct / bucket.total) * 100);
    await prisma.topic.update({
      where: { id: topic.id },
      data: {
        masteryScore: blendMastery(topic.masteryScore, accuracy),
        status: statusForAccuracy(accuracy),
        lastStudiedAt: new Date(),
      },
    });
  }
}

export async function submitAttemptAction(formData: FormData) {
  const userId = await requireUserId();
  const quizId = String(formData.get("quizId") ?? "");

  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId, userId },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!quiz || quiz.questions.length === 0) {
    redirect("/quizzes");
  }

  const startedAtRaw = Number(formData.get("startedAt") ?? 0);
  const timeSpentRaw = Number(formData.get("timeSpentSec") ?? 0);
  const startedAt =
    Number.isFinite(startedAtRaw) && startedAtRaw > 0 ? new Date(startedAtRaw) : new Date();

  const results = quiz.questions.map((question) => {
    const response =
      question.type === "match"
        ? JSON.stringify(
            parseMatchPairs(question.correctAnswer).map((_, index) =>
              String(formData.get(`q_${question.id}_${index}`) ?? "").trim(),
            ),
          )
        : String(formData.get(`q_${question.id}`) ?? "").trim();
    const correct = isAnswerCorrect(question.type, question.correctAnswer, response);
    return { question, response, correct };
  });

  const correctCount = results.filter((result) => result.correct).length;
  const score = Math.round((correctCount / quiz.questions.length) * 100);

  const attempt = await prisma.quizAttempt.create({
    data: {
      quizId: quiz.id,
      userId,
      startedAt,
      submittedAt: new Date(),
      score,
      maxScore: 100,
      timeSpentSec: clamp(Math.round(timeSpentRaw), 0, 7200),
      answers: {
        create: results.map((result) => ({
          questionId: result.question.id,
          response: result.response,
          isCorrect: result.correct,
          awardedPoints: result.correct ? result.question.points : 0,
        })),
      },
    },
  });

  await touchStreak(userId);
  await awardXp(userId, "quiz", XP_RULES.quiz, attempt.id);
  if (score === 100) {
    await awardXp(userId, "perfect_quiz", XP_RULES.perfectQuiz, attempt.id);
  }

  if (quiz.topicId || quiz.subjectId) {
    await applyTopicResults(userId, quiz, results);
  }

  await syncDailyGoal(userId);
  await evaluateAchievements(userId);

  revalidatePath("/quizzes");
  revalidatePath("/analytics");
  revalidatePath("/dashboard");
  revalidatePath("/achievements");

  redirect(`/quizzes/${quiz.id}/results?attempt=${attempt.id}`);
}

export async function deleteQuizAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  const quiz = await prisma.quiz.findFirst({ where: { id, userId } });
  if (!quiz) return;

  await prisma.$transaction(async (tx) => {
    await tx.answer.deleteMany({ where: { attempt: { quizId: id } } });
    await tx.quizAttempt.deleteMany({ where: { quizId: id } });
    await tx.question.deleteMany({ where: { quizId: id } });
    await tx.quiz.deleteMany({ where: { id, userId } });
  });

  revalidatePath("/quizzes");
  revalidatePath("/analytics");
  revalidatePath("/dashboard");
}
