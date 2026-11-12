import { normalizeAnswer, shuffle } from "@/lib/utils";

export type QuizQuestionType =
  | "mcq"
  | "truefalse"
  | "match"
  | "short"
  | "long"
  | "application"
  | "problem";

export type QuizMatchPair = { left: string; right: string };

export type QuizQuestionDraft = {
  type: QuizQuestionType;
  prompt: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
};

export const QUIZ_QUESTION_TYPES: QuizQuestionType[] = [
  "mcq",
  "truefalse",
  "match",
  "short",
  "long",
  "application",
  "problem",
];

/** Answer types graded with keyword overlap rather than an exact match. */
export const WRITTEN_QUESTION_TYPES = new Set<QuizQuestionType>([
  "short",
  "long",
  "application",
  "problem",
]);

const QUESTION_TYPES = new Set<QuizQuestionType>(QUIZ_QUESTION_TYPES);

export function isQuizQuestionType(value: unknown): value is QuizQuestionType {
  return typeof value === "string" && QUESTION_TYPES.has(value as QuizQuestionType);
}

export function questionTypeLabel(type: string) {
  switch (type) {
    case "mcq":
      return "Multiple choice";
    case "truefalse":
      return "True / false";
    case "match":
      return "Match the following";
    case "short":
      return "Short answer";
    case "long":
      return "Long answer";
    case "application":
      return "Application-based";
    case "problem":
      return "Problem-solving";
    default:
      return "Question";
  }
}

export function cleanQuestionText(value: unknown, maxLength = 2000) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function uniqueOptions(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const options: string[] = [];

  for (const entry of raw) {
    const option = cleanQuestionText(entry, 300);
    if (!option) continue;
    const key = normalizeAnswer(option);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    options.push(option);
  }

  return options;
}

/**
 * Reads matching pairs from the model (or from a saved question). Accepts
 * `{left, right}` objects, `[left, right]` tuples, or a JSON string of either.
 * Pairs are de-duplicated on both sides so two left terms can never map to the
 * same right option.
 */
export function parseMatchPairs(raw: unknown): QuizMatchPair[] {
  let value = raw;

  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return [];
    try {
      value = JSON.parse(text) as unknown;
    } catch {
      return [];
    }
  }

  if (!Array.isArray(value)) return [];

  const pairs: QuizMatchPair[] = [];
  const seenLeft = new Set<string>();
  const seenRight = new Set<string>();

  for (const entry of value.slice(0, 12)) {
    let left = "";
    let right = "";

    if (Array.isArray(entry)) {
      left = cleanQuestionText(entry[0], 200);
      right = cleanQuestionText(entry[1], 300);
    } else if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      left = cleanQuestionText(record.left ?? record.term ?? record.prompt, 200);
      right = cleanQuestionText(record.right ?? record.match ?? record.answer, 300);
    }

    if (!left || !right) continue;

    const leftKey = normalizeAnswer(left);
    const rightKey = normalizeAnswer(right);
    if (!leftKey || !rightKey) continue;
    if (seenLeft.has(leftKey) || seenRight.has(rightKey)) continue;

    seenLeft.add(leftKey);
    seenRight.add(rightKey);
    pairs.push({ left, right });
  }

  return pairs;
}

export function matchPairProblem(pairs: QuizMatchPair[]): string | null {
  const complete = pairs.filter(
    (pair) => pair.left.trim().length > 0 && pair.right.trim().length > 0,
  );
  if (complete.length < 2) return "Matching needs at least 2 complete pairs.";

  const leftKeys = complete.map((pair) => normalizeAnswer(pair.left));
  const rightKeys = complete.map((pair) => normalizeAnswer(pair.right));
  if (new Set(leftKeys).size !== leftKeys.length) return "Each left item must be unique.";
  if (new Set(rightKeys).size !== rightKeys.length) return "Each right option must be unique.";
  return null;
}

/**
 * Resolves the answer the model returned to the exact option text.
 * Handles exact matches, "B"/"Option B" style answers, and slightly
 * paraphrased answers such as "B. Metaphase".
 */
function resolveCorrectOption(options: string[], correctAnswer: string) {
  const target = normalizeAnswer(correctAnswer);
  if (!target) return null;

  const exact = options.find((option) => normalizeAnswer(option) === target);
  if (exact) return exact;

  const letter = /^(?:option\s*)?([a-f])$/i.exec(correctAnswer.trim());
  if (letter) {
    const index = letter[1].toLowerCase().charCodeAt(0) - 97;
    if (options[index]) return options[index];
  }

  const numbered = /^(?:option\s*)?(\d)$/i.exec(correctAnswer.trim());
  if (numbered) {
    const index = Number(numbered[1]) - 1;
    if (options[index]) return options[index];
  }

  const contained = options.find((option) => {
    const key = normalizeAnswer(option);
    return key.length >= 3 && (target.includes(key) || key.includes(target));
  });
  return contained ?? null;
}

/**
 * Validates and normalises one question.
 *
 * - mcq: four to six unique options, correct answer must be one of them.
 * - truefalse: exactly True/False.
 * - match: at least two unique pairs. `options` stores the shuffled right-hand
 *   choices; `correctAnswer` stores the hidden mapping as JSON.
 * - short/long/application/problem: no options, model answer or marking guide.
 */
export function normalizeQuizQuestion(raw: {
  type?: unknown;
  prompt?: unknown;
  options?: unknown;
  correctAnswer?: unknown;
  explanation?: unknown;
  pairs?: unknown;
} | null | undefined): QuizQuestionDraft | null {
  if (!raw || typeof raw !== "object") return null;

  const type = isQuizQuestionType(raw.type) ? raw.type : "short";
  const prompt = cleanQuestionText(raw.prompt);
  const explanation = cleanQuestionText(raw.explanation, 600);
  if (!prompt) return null;

  if (type === "match") {
    const pairs = parseMatchPairs(raw.pairs ?? raw.correctAnswer);
    if (pairs.length < 2) return null;
    return {
      type,
      prompt,
      options: shuffle(pairs.map((pair) => pair.right)),
      correctAnswer: JSON.stringify(pairs),
      explanation,
    };
  }

  const correctAnswer = cleanQuestionText(raw.correctAnswer);
  if (!correctAnswer) return null;

  let options = uniqueOptions(raw.options);

  if (type === "truefalse") {
    const normalized = normalizeAnswer(correctAnswer);
    const resolved =
      normalized === "true" || normalized === "t"
        ? "True"
        : normalized === "false" || normalized === "f"
          ? "False"
          : null;
    if (!resolved) return null;
    options = ["True", "False"];
    return { type, prompt, options, correctAnswer: resolved, explanation };
  }

  if (type === "short" || type === "long" || type === "application" || type === "problem") {
    return { type, prompt, options: [], correctAnswer, explanation };
  }

  if (options.length < 4) return null;

  if (options.length > 6) {
    const resolved = resolveCorrectOption(options, correctAnswer);
    const rest = options.filter((option) => option !== resolved);
    options = [...(resolved ? [resolved] : []), ...rest].slice(0, 6);
  }

  const resolved = resolveCorrectOption(options, correctAnswer);
  if (!resolved) return null;

  return { type, prompt, options, correctAnswer: resolved, explanation };
}

export function normalizeQuizQuestions(raw: unknown, limit = 40): QuizQuestionDraft[] {
  if (!Array.isArray(raw)) return [];

  const seenPrompts = new Set<string>();
  const questions: QuizQuestionDraft[] = [];

  for (const entry of raw.slice(0, limit * 2)) {
    const question = normalizeQuizQuestion(entry as Parameters<typeof normalizeQuizQuestion>[0]);
    if (!question) continue;

    const key = normalizeAnswer(question.prompt);
    if (!key || seenPrompts.has(key)) continue;

    seenPrompts.add(key);
    questions.push(question);
    if (questions.length >= limit) break;
  }

  return questions;
}

export function mcqOptionProblem(options: string[], correctAnswer: string) {
  const cleaned = options.map((option) => option.trim()).filter(Boolean);
  const unique = new Set(cleaned.map((option) => normalizeAnswer(option)));

  if (cleaned.length < 4) return "Multiple choice needs at least 4 options.";
  if (unique.size !== cleaned.length) return "Remove duplicate options.";
  if (!cleaned.includes(correctAnswer.trim())) return "Select the correct option.";
  return null;
}
