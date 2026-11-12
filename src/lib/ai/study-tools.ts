import { generateJson, generateText } from "@/lib/ai/gemini";
import { studyContent, type ContentStudy } from "@/lib/ai/content-study";
import { normalizeAnswer, shuffle } from "@/lib/utils";
import {
  QUIZ_QUESTION_TYPES,
  normalizeQuizQuestion,
  type QuizQuestionDraft,
  type QuizQuestionType,
} from "@/lib/quiz-rules";
import {
  buildDocumentMap,
  bulletLead,
  type MapBlock,
} from "@/lib/files/document-map";

export type CardFormat =
  | "concept"
  | "definition"
  | "explanation"
  | "comparison"
  | "application"
  | "process"
  | "formula";

export type QuizFormat =
  | "conceptual"
  | "definition"
  | "application"
  | "scenario"
  | "comparison"
  | "problem"
  | "formula"
  | "factual";

export type Difficulty = "easy" | "medium" | "hard";

export type GeneratedCard = {
  front: string;
  back: string;
  format: CardFormat;
  topicLabel: string;
  sourceRef: string;
  difficulty: Difficulty;
};

export type GeneratedQuestion = QuizQuestionDraft & {
  format: QuizFormat;
  topicLabel: string;
  sourceRef: string;
  difficulty: Difficulty;
};

export type GenerateQuizOptions = {
  difficulty?: Difficulty;
  formats?: QuizFormat[];
  questionTypes?: QuizQuestionType[];
  focusTopics?: string[];
};

/** Real staged progress for a background generation job. */
export type GenerationProgress = {
  stage: string;
  progress: number;
  produced?: number;
};

const SYSTEM_TUTOR =
  "You are Nova, a warm and encouraging study tutor for a student. Be accurate, concrete and friendly. " +
  "Never invent facts. Keep language simple. Prefer short paragraphs and bullet points. " +
  "When a student asks for an answer, give a hint first and let them think before revealing the full solution.";

const MIN_SENTENCE_WORDS = 4;
const MAX_SOURCE_SENTENCES = 320;
const MAX_CHUNK_CHARS = 6_000;

function collapse(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function stripLeadingMarks(line: string) {
  return line
    .replace(/^\s*(?:[-*•·▪◦]+|\d+[.)]|[a-z][.)])\s+/i, "")
    .replace(/^#{1,6}\s+/, "")
    .trim();
}

function hasOcrNoise(text: string) {
  const value = collapse(text);
  if (!value) return true;
  if (/\[illegible\]/i.test(value)) return true;

  const words = value
    .split(" ")
    .filter(Boolean)
    .filter((word) => !/^[_\-–—.]+$/.test(word));
  if (words.length === 0) return true;

  const garbled = words.filter(
    (word) =>
      /[bcdfghjklmnpqrstvwxyz]{7,}/i.test(word) || /(.)\1{3,}/.test(word),
  );
  return garbled.length / words.length > 0.34;
}

function isNoiseText(text: string) {
  const value = collapse(text);
  if (!value) return true;
  if (hasOcrNoise(value)) return true;
  if (/^(page|pg\.?)\s*\d+(\s*(of|\/)\s*\d+)?$/i.test(value)) return true;
  if (/^(page|pg\.?)\s*\d+\b/i.test(value)) return true;
  if (/\b(?:chapter|unit|section|module|lesson|part)\s*\d+\b/i.test(value)) return true;
  if (/^[\W\d_]+$/.test(value)) return true;

  const letters = (value.match(/[A-Za-z]/g) ?? []).length;
  if (letters < 3 || letters / value.length < 0.45) return true;

  return false;
}

function cleanSentence(raw: string) {
  const sentence = stripLeadingMarks(collapse(raw))
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim();

  if (!sentence || isNoiseText(sentence)) return null;

  const words = sentence.split(" ").filter(Boolean);
  if (words.length < MIN_SENTENCE_WORDS) return null;

  return sentence.slice(0, 600);
}

function sourceSentences(source: string) {
  const cleaned = source
    .replace(/\r/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");

  const chunks = cleaned
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9"“])/)
    .map((chunk) => cleanSentence(chunk))
    .filter((chunk): chunk is string => Boolean(chunk));

  const seen = new Set<string>();
  const sentences: string[] = [];

  for (const chunk of chunks) {
    const key = normalizeAnswer(chunk);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    sentences.push(chunk);
  }

  if (sentences.length <= MAX_SOURCE_SENTENCES) return sentences;

  const step = (sentences.length - 1) / (MAX_SOURCE_SENTENCES - 1);
  const sampled: string[] = [];
  for (let index = 0; index < MAX_SOURCE_SENTENCES; index++) {
    const sentence = sentences[Math.round(index * step)];
    if (sentence && !sampled.includes(sentence)) sampled.push(sentence);
  }
  return sampled;
}

export function splitSource(source: string, maxChars = MAX_CHUNK_CHARS) {
  const cleaned = source
    .replace(/\r/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!cleaned) return [];
  if (cleaned.length <= maxChars) return [cleaned];

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of cleaned.split(/\n{2,}/)) {
    const pieces =
      paragraph.length > maxChars
        ? paragraph.split(/(?<=[.!?])\s+/)
        : [paragraph];

    for (const piece of pieces) {
      let remaining = piece;

      while (remaining.length > maxChars) {
        if (current.trim()) {
          chunks.push(current.trim());
          current = "";
        }
        chunks.push(remaining.slice(0, maxChars).trim());
        remaining = remaining.slice(maxChars);
      }

      if (!remaining) continue;

      if (current && current.length + remaining.length + 2 > maxChars) {
        chunks.push(current.trim());
        current = "";
      }

      current = current ? `${current}\n\n${remaining}` : remaining;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

function sampleChunks(chunks: string[], maxChunks: number) {
  if (chunks.length <= maxChunks) return chunks;
  if (maxChunks <= 1) return [chunks[0]];

  const selected: string[] = [];
  const step = (chunks.length - 1) / (maxChunks - 1);
  for (let index = 0; index < maxChunks; index++) {
    selected.push(chunks[Math.round(index * step)]);
  }
  return selected;
}

function distribute(count: number, buckets: number) {
  const base = Math.floor(count / buckets);
  const remainder = count % buckets;
  return Array.from({ length: buckets }, (_, index) =>
    base + (index < remainder ? 1 : 0),
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  job: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) break;
        results[index] = await job(items[index], index);
      }
    },
  );

  await Promise.all(workers);
  return results;
}

function dedupeCards(cards: GeneratedCard[]) {
  const seen = new Set<string>();
  const unique: GeneratedCard[] = [];
  for (const card of cards) {
    const key = normalizeAnswer(card.front);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(card);
  }
  return unique;
}

function dedupeQuestions(questions: GeneratedQuestion[]) {
  const seen = new Set<string>();
  const unique: GeneratedQuestion[] = [];
  for (const question of questions) {
    const key = normalizeAnswer(question.prompt);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(question);
  }
  return unique;
}

type Definition = { term: string; meaning: string; sentence: string };

const NAMED_DEFINITION =
  /^(.{10,300}?)\s+(?:is|are)\s+(?:called|known as|termed)\s+(.{2,80})$/i;
const DIRECT_DEFINITION =
  /^(.{2,80}?)\s+(?:is|are|means|refers to|is defined as|are defined as)\s+(.{10,300})$/i;
const NON_DEFINITION_START =
  /^(?:example|exercise|problem|question|calculate|compute|find|solve|determine|evaluate|note|figure|table|step|activity|task|worked|solution|answer|proof|hint|remember|try|practice)\b/i;

/** Single generic dictionary/JSON-schema words are not study concepts. */
const GENERIC_TERMS = new Set([
  "model", "result", "results", "name", "type", "value", "string", "number",
  "boolean", "default", "profile", "user", "data", "field", "key", "title",
  "status", "usage", "index", "page", "list", "item", "version", "schema",
  "output", "input", "label", "level", "note", "notes", "content", "context",
  "response", "request", "size", "source", "target", "path", "mode", "test",
  "description", "score", "step", "factor", "area", "feature", "section",
]);

function cleanTerm(value: string) {
  const term = value
    .replace(/^(?:the|a|an)\s+/i, "")
    .replace(/[,:;.!?]+$/g, "")
    .replace(/^[•"'\s]+/, "")
    .trim();

  if (term.length < 2 || term.length > 70) return null;
  if (/^(it|they|this|that|these|those|he|she|we|you|there)$/i.test(term)) return null;
  if (term.split(" ").length > 6) return null;
  // Long clauses whose last word is prose-lowercase are sentence fragments,
  // not labels ("ResumeAI enforces a strict heuristic rule").
  if (term.split(" ").length >= 4 && /[a-z]$/.test(term)) return null;
  // Worked examples, instructions and labelled rows are not concepts.
  if (NON_DEFINITION_START.test(term)) return null;
  // JSON schema keys, code identifiers and middleware tokens leak in as terms.
  if (/^["'`]|[:=]|[{}]|\\|\.(?:ts|js|tsx)\b/i.test(term)) return null;
  // A real concept label starts with an uppercase letter (or an acronym);
  // lowercase first letters come from prose or code lines.
  if (!/^[A-Z0-9]/.test(term)) return null;
  if (GENERIC_TERMS.has(term.toLowerCase())) return null;
  if (isNoiseText(term)) return null;

  return term;
}

/** Bullet markers inside a glued line mark where the real meaning ends. */
const DEFINITION_BULLET_SPLIT = /(?:^|\s)(?:[•▪‣]|\bo\s)[\s]*/;

function cleanMeaning(value: string) {
  // A meaning inside a JSON/TypeScript schema block ("{ "name": "str..." }")
  // is code, never study content.
  if (/[{}]|"\s*:\s*"/.test(value)) return null;

  let meaning = value
    .replace(/^[,;:\s•"'']+/, "")
    .replace(/\s+/g, " ")
    .trim();

  // A meaning that starts with a circled sub-bullet ("o Scenario: ...") comes
  // from glued sub-lists under a heading, not from a labelled definition.
  if (/^o\s/.test(meaning)) return null;

  // Glued bullet lists ("Vercel Hobby Tier. • Node Runtime: ...") — keep only
  // the first labelled fact, never the whole list.
  const bulletIndex = meaning.search(DEFINITION_BULLET_SPLIT);
  if (bulletIndex > 15) meaning = meaning.slice(0, bulletIndex).trim();
  meaning = meaning.replace(/[.;:,\s]+$/, "").trim();

  if (meaning.length < 10) return null;
  if (/^(this|that|it|these|those)\b/i.test(meaning)) return null;
  // Inline code fragments (`missing`, sw.js) inside a meaning mean the line
  // came from a glued requirements/config table.
  if (/`|\\b```/.test(meaning)) return null;
  // A bare number/measurement is the answer to an example, not a definition.
  if (/^\d/.test(meaning)) return null;
  // A formula fragment ("𝑀 = 𝑆JD ∩ 𝑆profile") is not a meaning.
  if (/[𝑆𝑀𝑃𝐴𝐵𝑋𝑌]/.test(meaning) && /[=∪∩×Σ√]/.test(meaning)) return null;
  // A short lowercase fragment ("categorized into actionable ledgers") is a
  // parenthetical tail of a glued table row, not a definition.
  const wordCount = meaning.split(/\s+/).length;
  if (/^[a-z]/.test(meaning) && wordCount < 6) return null;
  if (hasOcrNoise(meaning)) return null;

  return meaning.slice(0, 400);
}

export function definitionsOf(sentences: string[]) {
  const definitions: Definition[] = [];
  const seen = new Set<string>();

  function add(termValue: string, meaningValue: string, sentence: string) {
    const term = cleanTerm(termValue);
    const meaning = cleanMeaning(meaningValue);
    if (!term || !meaning) return;

    const key = normalizeAnswer(term);
    if (!key || seen.has(key)) return;

    seen.add(key);
    definitions.push({ term, meaning, sentence });
  }

  for (const sentence of sentences) {
    // Worked examples and exercises are answers, not definitions.
    if (NON_DEFINITION_START.test(sentence)) continue;

    const named = NAMED_DEFINITION.exec(sentence);
    if (named) {
      add(named[2], named[1], sentence);
      continue;
    }

    const direct = DIRECT_DEFINITION.exec(sentence);
    if (direct) {
      add(direct[1], direct[2], sentence);
    }
  }

  return definitions;
}

function termQuestion(term: string) {
  return `What does "${term}" mean?`;
}

/** First sentence of a possibly multi-sentence source quote. */
function firstSentence(text: string) {
  const trimmed = text.trim();
  const match = /^(.{10,240}?[.!?])(?:\s|$)/.exec(trimmed);
  return (match ? match[1] : trimmed.slice(0, 240)).trim();
}

function capitaliseTerm(term: string) {
  return term ? term.charAt(0).toUpperCase() + term.slice(1) : term;
}

function sampleEvenly<T>(items: T[], count: number) {
  if (count <= 0) return [];
  if (items.length <= count) return items.slice();
  if (count === 1) return [items[0]];

  const step = (items.length - 1) / (count - 1);
  const picked: T[] = [];
  for (let index = 0; index < count; index++) {
    picked.push(items[Math.round(index * step)]);
  }
  return picked;
}

/* ------------------------------------------------------------------ */
/* Concept registry — page-aware, whole-document, strictly grounded    */
/* ------------------------------------------------------------------ */

type RegistrySentence = { text: string; page: number | null };

type RegistrySection = {
  title: string;
  page: number | null;
  sentences: RegistrySentence[];
  leads: string[];
};

type RegistryChapter = {
  label: string;
  title: string;
  startPage: number | null;
  endPage: number | null;
  sections: RegistrySection[];
};

/**
 * Splits a section's body lines into sentences, carrying the page of the line
 * where each sentence begins. Bullets participate too: a wrapped bullet and
 * its continuation lines naturally form one sentence.
 */
function sentencesFromBlocks(
  blocks: MapBlock[],
  maxSentences = 60,
): RegistrySentence[] {
  const out: RegistrySentence[] = [];
  let buffer = "";
  let bufferPage: number | null = null;

  const flush = () => {
    if (!buffer) return;
    const sentence = cleanSentence(buffer);
    if (sentence) out.push({ text: sentence, page: bufferPage });
    buffer = "";
    bufferPage = null;
  };

  for (const block of blocks) {
    // Strip bullet/circled markers so labelled bullet facts
    // ("Automated Unit Testing: Evaluates ...") match definition patterns.
    const line = block.text
      .replace(/\[\[page:\s*\d+\s*\]\]/g, "")
      .replace(/^\s*[•▪‣◦·]+[\s]*/, "")
      .replace(/^\s*o\s+(?=[A-Z])/, "")
      .trim();
    if (!line) continue;

    const chunks = line.split(/(?<=[.!?])\s+/).filter((part) => part.trim());
    for (const chunkRaw of chunks) {
      const chunk = collapse(chunkRaw);
      if (!chunk) continue;
      // A sentence-final buffer followed by a capitalised/digit chunk means
      // the chunk was NOT a wrapped continuation ("...job." / "In Cell
      // Structure, ...") — flush before appending.
      if (buffer && /[.!?]$/.test(buffer) && /^[A-Z0-9("“]/.test(chunk)) flush();
      if (!buffer) bufferPage = block.page;
      buffer = buffer ? `${buffer} ${chunk}` : chunk;
      // Mid-line sentence ends can flush immediately; the final chunk of a
      // line stays buffered because the next line decides if it continues.
      if (chunks.length > 1 && /[.!?]$/.test(buffer) && chunk !== collapse(chunks[chunks.length - 1])) {
        flush();
      }
    }
  }
  flush();

  const seen = new Set<string>();
  const unique = out.filter((sentence) => {
    const key = normalizeAnswer(sentence.text);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.length > maxSentences ? sampleEvenly(unique, maxSentences) : unique;
}

export function registryFor(source: string): {
  chapters: RegistryChapter[];
  haystack: string;
} | null {
  const map = buildDocumentMap(source);
  if (map.chapters.length < 2) return null;

  const chapters: RegistryChapter[] = [];
  for (const chapter of map.chapters) {
    const sections: RegistrySection[] = [];

    const toSection = (
      title: string,
      page: number | null,
      body: MapBlock[],
      bullets: MapBlock[],
    ): RegistrySection => ({
      title,
      page,
      sentences: sentencesFromBlocks(body),
      leads: bullets
        .map((bullet) => bulletLead(bullet.text))
        .filter((lead): lead is string => Boolean(lead)),
    });

    if (chapter.sections.length > 0) {
      for (const section of chapter.sections) {
        sections.push(
          toSection(section.title, section.page, section.body, section.bullets),
        );
      }
    } else {
      sections.push(
        toSection(
          chapter.title,
          chapter.startPage,
          chapter.introBody,
          chapter.introBullets,
        ),
      );
    }

    const usable = sections.filter((section) => section.sentences.length > 0);
    if (usable.length === 0) continue;

    chapters.push({
      label: chapter.label,
      title: chapter.title,
      startPage: chapter.startPage,
      endPage: chapter.endPage,
      sections: usable,
    });
  }

  if (chapters.length < 2) return null;

  return {
    chapters,
    haystack: normalizeAnswer(source.replace(/\[\[page:\s*\d+\s*\]\]/g, " ")),
  };
}

/** Counts whole-phrase occurrences of a normalized term in the source. */
function phraseRepeats(haystack: string, phrase: string) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = haystack.match(
    new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "g"),
  );
  return matches ? matches.length : 0;
}

/** A labelled bullet/paragraph fact: "Automated Unit Testing: Evaluates ...". */
const LABELLED_FACT = /^([A-Z][^:]{2,70}):\s+(.{10,})$/;

type RegistryDefinition = Definition & {
  chapterIndex: number;
  chapterLabel: string;
  sectionTitle: string;
  page: number | null;
};

/**
 * Collects the doc's definitions with their chapter and page. A definition
 * only becomes a concept when its term is a section title or bullet lead-of
 * the document, or when the term is repeated at least twice — arbitrary
 * sentence fragments never qualify.
 */
export function registryDefinitions(registry: {
  chapters: RegistryChapter[];
  haystack: string;
}): RegistryDefinition[] {
  const qualifiedLeads = new Set<string>();
  for (const chapter of registry.chapters) {
    for (const section of chapter.sections) {
      if (section.title.length >= 4) {
        qualifiedLeads.add(normalizeAnswer(section.title));
      }
      for (const lead of section.leads) {
        if (lead.length >= 4) qualifiedLeads.add(normalizeAnswer(lead));
      }
    }
  }

  const minRepeat = registry.haystack.length > 12_000 ? 3 : 2;
  const definitions: RegistryDefinition[] = [];
  const seen = new Set<string>();

  registry.chapters.forEach((chapter, chapterIndex) => {
    for (const section of chapter.sections) {
      for (const sentence of section.sentences) {
        if (NON_DEFINITION_START.test(sentence.text)) continue;

        const candidates: Definition[] = [];
        const labelled = LABELLED_FACT.exec(sentence.text);
        if (labelled) {
          const term = cleanTerm(labelled[1]);
          const meaning = cleanMeaning(labelled[2]);
          if (term && meaning) candidates.push({ term, meaning, sentence: sentence.text });
        }

        const direct = definitionsOf([sentence.text]);
        candidates.push(...direct);

        for (const candidate of candidates) {
          const key = normalizeAnswer(candidate.term);
          if (!key || seen.has(key)) continue;
          const repeats = phraseRepeats(registry.haystack, key);
          if (!qualifiedLeads.has(key) && repeats < minRepeat) continue;

          seen.add(key);
          definitions.push({
            ...candidate,
            chapterIndex,
            chapterLabel: chapter.label,
            sectionTitle: section.title,
            page: sentence.page,
          });
        }
      }
    }
  });

  return definitions;
}

/**
 * Formula cards are only produced when the material literally states a
 * formula/equation and explains it. We never invent a formula or strip a
 * random word out of a sentence to manufacture a question.
 */
function isExplicitFormula(sentence: string) {
  if (!/[=≈]/.test(sentence)) return false;
  if (!/\b(?:formula|equation|where|represents|means|is used|given by)\b/i.test(sentence)) {
    return false;
  }
  const [left, right] = sentence.split(/[=≈]/);
  if (!left?.trim() || !right?.trim()) return false;
  return left.trim().split(/\s+/).length <= 8;
}

function localCardsFromSentences(source: string, count: number, context?: string): GeneratedCard[] {
  const sentences = sourceSentences(source);
  const definitions = definitionsOf(sentences);
  const cards: GeneratedCard[] = [];
  const seenFronts = new Set<string>();

  function push(
    front: string,
    back: string,
    format: CardFormat,
    sourceRef = "",
  ) {
    if (cards.length >= count) return;

    const cleanFront = collapse(front).slice(0, 600);
    const cleanBack = collapse(back).slice(0, 800);
    if (!isUsefulCard(cleanFront, cleanBack)) return;

    const key = normalizeAnswer(cleanFront);
    if (!key || seenFronts.has(key)) return;

    seenFronts.add(key);
    cards.push({
      front: cleanFront,
      back: cleanBack,
      format,
      topicLabel: context?.slice(0, 80) ?? "",
      sourceRef,
      difficulty: format === "application" ? "hard" : "medium",
    });
  }

  // Group candidate cards by their position in the document. Sampling across
  // groups (instead of consuming one flat list front-to-back) is what keeps the
  // deck balanced: a long chapter cannot crowd out later chapters.
  const groups: Array<Array<() => void>> = sentences.map(() => []);
  const positionOf = new Map<string, number>();
  sentences.forEach((sentence, index) => {
    const key = normalizeAnswer(sentence);
    if (key && !positionOf.has(key)) positionOf.set(key, index);
  });

  for (const definition of definitions) {
    const index = positionOf.get(normalizeAnswer(definition.sentence)) ?? 0;
    groups[index].push(() =>
      push(termQuestion(definition.term), definition.meaning, "definition"),
    );
  }

  // Only explicit formulas get a formula card, with the material's own
  // explanation as the answer.
  for (const [index, sentence] of sentences.entries()) {
    if (!isExplicitFormula(sentence)) continue;
    groups[index].push(() =>
      push(`What does this formula mean?\n\n${sentence}`, sentence, "formula"),
    );
  }

  const nonEmpty = groups.filter((group) => group.length > 0);
  const queues = nonEmpty.map((group) => [...group]);

  // First pass: spread the requested count evenly across the whole document.
  for (const queue of sampleEvenly(queues, Math.min(count, queues.length))) {
    if (cards.length >= count) break;
    queue.shift()?.();
  }

  // Second pass: round-robin over every group's remaining builders so extra
  // cards still come from all sections rather than only the opening pages.
  let progressed = true;
  while (cards.length < count && progressed) {
    progressed = false;
    for (const queue of queues) {
      if (cards.length >= count) break;
      const builder = queue.shift();
      if (!builder) continue;
      progressed = true;
      builder();
    }
  }

  return cards.slice(0, count);
}

function localQuizFromSentences(
  source: string,
  count: number,
  context?: string,
  options?: GenerateQuizOptions,
): GeneratedQuestion[] {
  const sentences = sourceSentences(source);
  if (sentences.length === 0) return [];

  const requested = options?.questionTypes?.length
    ? options.questionTypes
    : (["mcq", "truefalse", "short"] as QuizQuestionType[]);
  const allowed = new Set(requested);
  const difficulty = options?.difficulty ?? "medium";

  const definitions = definitionsOf(sentences);
  if (definitions.length === 0) return [];
  const terms = [...new Set(definitions.map((definition) => definition.term))];

  const questions: GeneratedQuestion[] = [];
  const seenPrompts = new Set<string>();

  function add(question: GeneratedQuestion) {
    if (questions.length >= count) return;
    const key = normalizeAnswer(question.prompt);
    if (!key || seenPrompts.has(key)) return;
    seenPrompts.add(key);
    questions.push(question);
  }

  function base(format: QuizFormat) {
    return {
      format,
      topicLabel: context?.slice(0, 80) ?? "",
      sourceRef: "",
      difficulty,
    };
  }

  // Builders are grouped by their position in the document and then
  // interleaved across answer types, so a long first chapter cannot crowd out
  // later chapters and a multi-type request stays balanced by type too.
  const positionBuilders = new Map<
    number,
    Map<QuizQuestionType, Array<() => GeneratedQuestion | null>>
  >();
  const typeBuilders = new Map<QuizQuestionType, Array<() => GeneratedQuestion | null>>();
  const positionOf = new Map<string, number>();
  sentences.forEach((sentence, index) => {
    const key = normalizeAnswer(sentence);
    if (key && !positionOf.has(key)) positionOf.set(key, index);
  });

  function addBuilder(
    type: QuizQuestionType,
    sentence: string,
    builder: () => GeneratedQuestion | null,
  ) {
    if (!allowed.has(type)) return;
    const index = positionOf.get(normalizeAnswer(sentence)) ?? 0;
    const byType =
      positionBuilders.get(index) ??
      new Map<QuizQuestionType, Array<() => GeneratedQuestion | null>>();
    const list = byType.get(type) ?? [];
    list.push(builder);
    byType.set(type, list);
    positionBuilders.set(index, byType);

    const typeList = typeBuilders.get(type) ?? [];
    typeList.push(builder);
    typeBuilders.set(type, typeList);
  }

  // Every local question is grounded in an explicit definition from the
  // material. We never delete a random word or treat an arbitrary sentence as
  // a question, because that produces ambiguous prompts and invented keys.
  if (allowed.has("mcq") && terms.length >= 4) {
    for (const definition of definitions) {
      addBuilder("mcq", definition.sentence, () => {
        const distractors = shuffle(
          terms.filter(
            (term) => normalizeAnswer(term) !== normalizeAnswer(definition.term),
          ),
        ).slice(0, 3);
        if (distractors.length < 3) return null;

        return {
          type: "mcq",
          prompt: `Which term matches this description?\n\n"${definition.meaning}"`,
          options: shuffle([definition.term, ...distractors]),
          correctAnswer: definition.term,
          explanation: `Your material defines ${definition.term} as: "${definition.meaning}"`,
          ...base("definition"),
        };
      });
    }
  }

  if (allowed.has("truefalse")) {
    for (const [index, definition] of definitions.entries()) {
      const other = definitions.find(
        (candidate) =>
          normalizeAnswer(candidate.term) !== normalizeAnswer(definition.term) &&
          normalizeAnswer(candidate.meaning) !== normalizeAnswer(definition.meaning),
      );

      // Alternate true and false statements so a deck is not all "True".
      if (index % 2 === 1 && other) {
        addBuilder("truefalse", definition.sentence, () => ({
          type: "truefalse",
          prompt: `True or false: ${capitaliseTerm(other.term)} is ${definition.meaning.replace(
            /[.!?]+$/,
            "",
          )}.`,
          options: ["True", "False"],
          correctAnswer: "False",
          explanation: `Your material says ${other.term} is ${other.meaning}, not ${definition.meaning}.`,
          ...base("factual"),
        }));
      } else {
        addBuilder("truefalse", definition.sentence, () => ({
          type: "truefalse",
          prompt: `True or false: ${definition.sentence}`,
          options: ["True", "False"],
          correctAnswer: "True",
          explanation: `Your material states: "${definition.sentence}"`,
          ...base("factual"),
        }));
      }
    }
  }

  if (allowed.has("match") && definitions.length >= 2) {
    for (let index = 0; index < definitions.length - 1; index += 3) {
      const group = definitions.slice(index, index + 3);
      if (group.length < 2) continue;

      const pairs = group.map((definition) => ({
        left: definition.term,
        right: definition.meaning.slice(0, 180),
      }));

      addBuilder("match", group[0].sentence, () => ({
        type: "match",
        prompt: "Match each term with its meaning.",
        options: shuffle(pairs.map((pair) => pair.right)),
        correctAnswer: JSON.stringify(pairs),
        explanation: `Pairs come from your material: ${group
          .map((definition) => `"${definition.sentence}"`)
          .join(" ")}`,
        ...base("definition"),
      }));
    }
  }

  // Written answer types share one claim per term, so the same definition is
  // not asked twice as both a short and a long question.
  const usedWritten = new Set<string>();
  function claimWritten(term: string) {
    const key = normalizeAnswer(term);
    if (!key || usedWritten.has(key)) return false;
    usedWritten.add(key);
    return true;
  }

  if (allowed.has("short")) {
    for (const definition of definitions) {
      addBuilder("short", definition.sentence, () => {
        if (!claimWritten(definition.term)) return null;
        return {
          type: "short",
          prompt: `What does "${definition.term}" mean?`,
          options: [],
          correctAnswer: definition.meaning,
          explanation: `Model answer from your material: "${definition.meaning}"`,
          ...base("definition"),
        };
      });
    }
  }

  if (allowed.has("long")) {
    for (const definition of definitions) {
      addBuilder("long", definition.sentence, () => {
        if (!claimWritten(definition.term)) return null;
        return {
          type: "long",
          prompt: `Explain "${definition.term}" in detail, using the material to support your answer.`,
          options: [],
          correctAnswer: definition.sentence,
          explanation: `Marking guide: ${definition.meaning}`,
          ...base("conceptual"),
        };
      });
    }
  }

  // Application questions are only created when the material itself shows how
  // the concept is used. Otherwise the type is reported as unsupported rather
  // than replaced with a vague "apply this" prompt.
  if (allowed.has("application")) {
    for (const definition of definitions) {
      if (
        !/\b(?:for example|e\.g\.|such as|used to|is used|are used|helps?|allows?|so that|in order to)\b/i.test(
          definition.sentence,
        )
      ) {
        continue;
      }

      addBuilder("application", definition.sentence, () => {
        if (!claimWritten(definition.term)) return null;
        return {
          type: "application",
          prompt: `Apply the idea of "${definition.term}" to a new situation and explain your reasoning.`,
          options: [],
          correctAnswer: definition.meaning,
          explanation: `Use this idea from your material: "${definition.sentence}"`,
          ...base("application"),
        };
      });
    }
  }

  // Rotate the type order for each position so the first card taken from every
  // evenly-spaced group varies by answer type.
  const typeOrder = requested.filter((type) => allowed.has(type));
  const groups: Array<Array<() => GeneratedQuestion | null>> = [];
  for (const [index, byType] of [...positionBuilders.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    const start = typeOrder.length ? index % typeOrder.length : 0;
    const rotated = [
      ...typeOrder.slice(start),
      ...typeOrder.slice(0, start),
    ];
    const queues = rotated
      .map((type) => [...(byType.get(type) ?? [])])
      .filter((queue) => queue.length > 0);
    const group: Array<() => GeneratedQuestion | null> = [];
    let added = true;
    while (added) {
      added = false;
      for (const queue of queues) {
        const builder = queue.shift();
        if (builder) {
          group.push(builder);
          added = true;
        }
      }
    }
    if (group.length > 0) groups.push(group);
  }

  const queues = groups.map((group) => [...group]);

  // Every selected answer type should appear at least once when the material
  // can support it. Spread those guaranteed questions across the document so
  // they do not all come from the first chapter.
  typeOrder.forEach((type, typeIndex) => {
    if (questions.length >= count) return;
    const candidates = typeBuilders.get(type) ?? [];
    if (candidates.length === 0) return;
    const spread =
      typeOrder.length > 1 ? typeIndex / (typeOrder.length - 1) : 0;
    const index = Math.min(
      candidates.length - 1,
      Math.round(spread * (candidates.length - 1)),
    );
    // Try from the spread position so the guaranteed question for this type is
    // not always taken from chapter one; skip builders that cannot produce a
    // distinct question.
    let question: GeneratedQuestion | null = null;
    for (let offset = 0; offset < candidates.length; offset += 1) {
      const candidate = candidates[(index + offset) % candidates.length];
      question = candidate?.() ?? null;
      if (question) break;
    }
    if (question) add(question);
  });

  // First pass: one question from evenly-spaced positions across the document,
  // using only the slots that remain after the type-coverage pass.
  const remaining = count - questions.length;
  for (const queue of sampleEvenly(queues, Math.min(remaining, queues.length))) {
    if (questions.length >= count) break;
    const question = queue.shift()?.();
    if (question) add(question);
  }

  // Second pass: round-robin over every position so extra questions keep
  // covering the whole document instead of only the opening pages.
  let progressed = true;
  while (questions.length < count && progressed) {
    progressed = false;
    for (const queue of queues) {
      if (questions.length >= count) break;
      const builder = queue.shift();
      if (!builder) continue;
      progressed = true;
      const question = builder();
      if (question) add(question);
    }
  }

  return questions.slice(0, count);
}

/* ------------------------------------------------------------------ */
/* Map-driven local generation — distributed across all chapters       */
/* ------------------------------------------------------------------ */

function combineCardLists(lists: GeneratedCard[][], count: number) {
  const seen = new Set<string>();
  const result: GeneratedCard[] = [];

  // Round-robin: one card from chapter 1, then chapter 2, ... and only then a
  // second card from chapter 1. Chapter length can never crowd out later ones.
  for (let round = 0; result.length < count; round += 1) {
    let progressed = false;
    for (const list of lists) {
      if (result.length >= count) break;
      const card = list[round];
      if (!card) continue;
      progressed = true;
      const key = normalizeAnswer(card.front);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(card);
    }
    if (!progressed) break;
  }

  return result;
}

export function localCards(source: string, count: number, context?: string): GeneratedCard[] {
  const registry = registryFor(source);

  if (!registry) return localCardsFromSentences(source, count, context);

  const definitions = registryDefinitions(registry);
  const chapters = registry.chapters;

  const chapterQueues: GeneratedCard[][] = chapters.map((chapter, chapterIndex) => {
    const cards: GeneratedCard[] = [];

    const push = (card: GeneratedCard) => {
      if (cards.length >= count + 3) return;
      cards.push(card);
    };

    for (const definition of definitions.filter(
      (entry) => entry.chapterIndex === chapterIndex,
    )) {
      push({
        front: termQuestion(definition.term),
        back: definition.meaning,
        format: "definition",
        topicLabel: definition.sectionTitle.slice(0, 80),
        sourceRef: definition.page ? `p. ${definition.page}` : "",
        difficulty: "medium",
      });
    }

    for (const section of chapter.sections) {
      for (const sentence of section.sentences) {
        if (!isExplicitFormula(sentence.text)) continue;
        // Glued multi-row table "formulas" are unreadable fragments.
        if (sentence.text.length > 200) continue;
        push({
          front: `Write the formula or rule used for: ${section.title}`,
          back: sentence.text,
          format: "formula",
          topicLabel: section.title.slice(0, 80),
          sourceRef: sentence.page ? `p. ${sentence.page}` : "",
          difficulty: "hard",
        });
      }
    }

    return cards;
  });

  const cards = combineCardLists(chapterQueues, count);
  if (cards.length > 0) return cards;

  // Nothing qualified in the mapped chapters — fall back to the older
  // sentence-driven generator so the deck never comes back empty.
  return localCardsFromSentences(source, count, context);
}

type CandidateFactory = {
  type: QuizQuestionType;
  chapterIndex: number;
  make: () => GeneratedQuestion | null;
};

function registryQuiz(
  registry: { chapters: RegistryChapter[]; haystack: string },
  count: number,
  context?: string,
  options?: GenerateQuizOptions,
): GeneratedQuestion[] {
  const requested = options?.questionTypes?.length
    ? options.questionTypes
    : (["mcq", "truefalse", "short"] as QuizQuestionType[]);
  const allowed = new Set(requested);
  const difficulty = options?.difficulty ?? "medium";
  const definitions = registryDefinitions(registry);
  if (definitions.length === 0) return [];

  const chapterDefs = new Map<number, RegistryDefinition[]>();
  for (const definition of definitions) {
    const list = chapterDefs.get(definition.chapterIndex) ?? [];
    list.push(definition);
    chapterDefs.set(definition.chapterIndex, list);
  }
  const termsPool = definitions.map((definition) => definition.term);

  // Factories stay lazily evaluated: written-answer claims (`claimWritten`)
  // must fire at production time, so one definition can serve whichever
  // written type is actually requested first.
  const factories: CandidateFactory[] = [];
  const seenPrompts = new Set<string>();
  const usedWritten = new Set<string>();
  const claimWritten = (term: string) => {
    const key = normalizeAnswer(term);
    if (!key || usedWritten.has(key)) return false;
    usedWritten.add(key);
    return true;
  };

  const addFactory = (
    chapterIndex: number,
    type: QuizQuestionType,
    make: () => GeneratedQuestion | null,
  ) => {
    if (!allowed.has(type)) return;
    factories.push({ type, chapterIndex, make });
  };

  for (const [index, definition] of definitions.entries()) {
    const label = definition.sectionTitle.slice(0, 80);
    const pageRef = definition.page ? `p. ${definition.page}` : "";
    const base = {
      format: "definition" as QuizFormat,
      topicLabel: label,
      sourceRef: pageRef,
      difficulty,
    };

    if (termsPool.length >= 4) {
      const distractors = shuffle(
        termsPool.filter(
          (term) => normalizeAnswer(term) !== normalizeAnswer(definition.term),
        ),
      ).slice(0, 3);
      if (distractors.length === 3) {
        addFactory(definition.chapterIndex, "mcq", () => ({
          type: "mcq" as QuizQuestionType,
          prompt: `Which term matches this description?\n\n"${definition.meaning}"`,
          options: shuffle([definition.term, ...distractors]),
          correctAnswer: definition.term,
          explanation: `Your material defines ${definition.term} as: "${definition.meaning}"`,
          format: "definition" as QuizFormat,
          topicLabel: label,
          sourceRef: pageRef,
          difficulty,
        }));
      }
    }

    if (allowed.has("truefalse")) {
      const others = [
        ...(chapterDefs.get(definition.chapterIndex) ?? []),
        ...definitions,
      ].filter(
        (candidate) =>
          normalizeAnswer(candidate.term) !== normalizeAnswer(definition.term) &&
          normalizeAnswer(candidate.meaning) !== normalizeAnswer(definition.meaning),
      );
      const other = others[index % Math.max(1, others.length)];

      // Statements quote a single clean sentence, never raw multi-bullet
      // source lines.
      if (index % 2 === 1 && other) {
        const statement = firstSentence(other.meaning);
        addFactory(definition.chapterIndex, "truefalse", () => {
          if (statement.length < 15) return null;
          return {
            type: "truefalse" as QuizQuestionType,
            prompt: `True or false: "${statement}" is the description of ${capitaliseTerm(definition.term)} in your material.`,
            options: ["True", "False"],
            correctAnswer: "False",
            explanation: `Your material ties that description to ${other.term}: "${statement}". ${definition.term} is ${definition.meaning}`,
            format: "factual" as QuizFormat,
            topicLabel: label,
            sourceRef: pageRef,
            difficulty,
          };
        });
      } else {
        const statement = firstSentence(definition.meaning);
        addFactory(definition.chapterIndex, "truefalse", () => {
          if (statement.length < 15) return null;
          return {
            type: "truefalse" as QuizQuestionType,
            prompt: `True or false: "${statement}" is the description of ${capitaliseTerm(definition.term)} in your material.`,
            options: ["True", "False"],
            correctAnswer: "True",
            explanation: `Your material defines ${definition.term} as: "${statement}"`,
            format: "factual" as QuizFormat,
            topicLabel: label,
            sourceRef: pageRef,
            difficulty,
          };
        });
      }
    }

    if (allowed.has("short")) {
      addFactory(definition.chapterIndex, "short", () => {
        if (!claimWritten(definition.term)) return null;
        return {
          type: "short" as QuizQuestionType,
          prompt: `What does "${definition.term}" mean?`,
          options: [],
          correctAnswer: definition.meaning,
          explanation: `Model answer from your material: "${definition.meaning}"`,
          ...base,
        };
      });
    }

    if (allowed.has("long")) {
      addFactory(definition.chapterIndex, "long", () => {
        if (!claimWritten(definition.term)) return null;
        return {
          type: "long" as QuizQuestionType,
          prompt: `Explain "${definition.term}" in detail, using the material to support your answer.`,
          options: [],
          correctAnswer: definition.sentence,
          explanation: `Marking guide: ${definition.meaning}`,
          format: "conceptual" as QuizFormat,
          topicLabel: label,
          sourceRef: pageRef,
          difficulty,
        };
      });
    }

    if (
      /\b(?:for example|e\.g\.|such as|used to|is used|are used|helps?|allows?|so that|in order to)\b/i.test(
        definition.sentence,
      )
    ) {
      addFactory(definition.chapterIndex, "application", () => {
        if (!claimWritten(definition.term)) return null;
        return {
          type: "application" as QuizQuestionType,
          prompt: `Apply the idea of "${definition.term}" to a new situation and explain your reasoning.`,
          options: [],
          correctAnswer: definition.meaning,
          explanation: `Use this idea from your material: "${definition.sentence}"`,
          format: "application" as QuizFormat,
          topicLabel: label,
          sourceRef: pageRef,
          difficulty,
        };
      });
    }
  }

  if (allowed.has("match")) {
    // Pairing works across chapters: slide over the whole definition list so
    // a chapter with a single definition still gets match questions.
    for (let index = 0; index < definitions.length - 1; index += 3) {
      const group = definitions.slice(index, index + 3);
      if (group.length < 2) continue;
      const head = group[0];
      addFactory(head.chapterIndex, "match", () => ({
        type: "match" as QuizQuestionType,
        prompt: `Match each term with its meaning (${head.sectionTitle}).`,
        options: shuffle(group.map((definition) => definition.meaning.slice(0, 180))),
        correctAnswer: JSON.stringify(
          group.map((definition) => ({
            left: definition.term,
            right: definition.meaning.slice(0, 180),
          })),
        ),
        explanation: `Pairs come from your material: ${group
          .map((definition) => `"${definition.sentence}"`)
          .join(" ")}`,
        format: "definition" as QuizFormat,
        topicLabel: head.sectionTitle.slice(0, 80),
        sourceRef: head.page ? `p. ${head.page}` : "",
        difficulty,
      }));
    }
  }

  if (factories.length === 0) return [];

  // Every selected answer type should appear at least once, taken from
  // chapters spread across the document; additional slots go to the
  // least-covered chapters so one long chapter cannot crowd out the rest.
  const questions: GeneratedQuestion[] = [];
  const used = new Set<number>();
  const picksPerChapter = new Array<number>(registry.chapters.length).fill(0);

  const pickFor = (filter?: (factory: CandidateFactory) => boolean) => {
    while (true) {
      let best = -1;
      for (let index = 0; index < factories.length; index++) {
        if (used.has(index)) continue;
        if (filter && !filter(factories[index])) continue;
        if (
          best === -1 ||
          picksPerChapter[factories[index].chapterIndex] <
            picksPerChapter[factories[best].chapterIndex]
        ) {
          best = index;
        }
      }
      if (best === -1) return false;
      used.add(best);
      const question = factories[best].make();
      if (!question) continue;
      const key = normalizeAnswer(question.prompt);
      if (!key || seenPrompts.has(key)) continue;
      seenPrompts.add(key);
      questions.push(question);
      picksPerChapter[factories[best].chapterIndex] += 1;
      return true;
    }
  };

  for (const type of requested.filter((entry) => allowed.has(entry))) {
    if (questions.length >= count) return questions.slice(0, count);
    pickFor((factory) => factory.type === type);
  }

  while (questions.length < count) {
    if (!pickFor()) break;
  }

  return questions.slice(0, count);
}

export function localQuiz(
  source: string,
  count: number,
  context?: string,
  options?: GenerateQuizOptions,
): GeneratedQuestion[] {
  const registry = registryFor(source);

  if (!registry) return localQuizFromSentences(source, count, context, options);

  const questions = registryQuiz(registry, count, context, options);
  if (questions.length > 0) return questions;

  // Nothing qualified in the mapped chapters — fall back to the older
  // sentence-driven generator so the quiz never comes back empty.
  return localQuizFromSentences(source, count, context, options);
}

function localSummary(title: string, content: string) {
  const sentences = sourceSentences(content);
  const bullets = sentences.slice(0, 5).map((sentence) => `- ${sentence}`);
  return [
    `**${title || "Revision summary"}**`,
    "",
    sentences[0] ?? content.slice(0, 200),
    "",
    "**Key points**",
    bullets.join("\n") || "- Add a little more detail to your notes for a richer summary.",
    "",
    "**One-line takeaway**",
    sentences[sentences.length - 1] ?? "Review the notes once more, then test yourself with a flashcard.",
  ].join("\n");
}

function cleanCardText(value: unknown, max = 600) {
  return collapse(String(value ?? "")).slice(0, max);
}

function isUsefulCard(front: string, back: string) {
  if (front.length < 8 || back.length < 2) return false;
  if (hasOcrNoise(front) || hasOcrNoise(back)) return false;
  if (normalizeAnswer(front) === normalizeAnswer(back)) return false;
  if (/^(what is the (key|main) idea|what is this about|explain this|define this)\b/i.test(front)) {
    return false;
  }
  // Cloze/fill-in-the-blank cards are not supported at all. Reject any card
  // that still contains a manufactured blank.
  if (/_{3,}/.test(front) || /fill in the blank/i.test(front)) return false;
  if (front.split(/\s+/).length > 90 || back.split(/\s+/).length > 120) return false;
  return true;
}

function normalizeCardFormat(value: unknown, front: string): CardFormat {
  const raw = String(value ?? "").toLowerCase();
  if (
    ["concept", "definition", "explanation", "comparison", "application", "process", "formula"].includes(
      raw,
    )
  ) {
    return raw as CardFormat;
  }
  if (/^what does .+ mean\?/i.test(front)) return "definition";
  if (/\b(?:compare|difference|unlike|whereas)\b/i.test(front)) return "comparison";
  if (/\b(?:formula|equation)\b/i.test(front)) return "formula";
  if (/\b(?:process|steps?|stages?)\b/i.test(front)) return "process";
  if (/\b(?:apply|use|calculate|solve|example)\b/i.test(front)) return "application";
  return "concept";
}

function normalizeDifficulty(value: unknown, fallback: Difficulty = "medium"): Difficulty {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "easy" || raw === "medium" || raw === "hard") return raw;
  return fallback;
}

function sanitizeAiCards(raw: unknown, count: number, context?: string): GeneratedCard[] {
  if (!Array.isArray(raw)) return [];

  const cards: GeneratedCard[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;

    const card = entry as Record<string, unknown>;
    const front = cleanCardText(card.front);
    const back = cleanCardText(card.back);
    if (!isUsefulCard(front, back)) continue;

    const format = normalizeCardFormat(card.format, front);

    const key = normalizeAnswer(front);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    cards.push({
      front,
      back,
      format,
      topicLabel: cleanCardText(card.topicLabel ?? card.topic ?? context, 80),
      sourceRef: cleanCardText(card.sourceRef ?? card.source, 120),
      difficulty: normalizeDifficulty(card.difficulty),
    });
    if (cards.length >= count) break;
  }

  return cards;
}

function isUsefulQuestionPrompt(prompt: string) {
  if (prompt.length < 10) return false;
  if (hasOcrNoise(prompt)) return false;
  if (/^(question\s*\d+|q\d+)$/i.test(prompt)) return false;
  if (/^(what is this about|explain this|which is correct\?|is this true\?)$/i.test(prompt)) {
    return false;
  }
  return true;
}

function normalizeQuizFormat(value: unknown, prompt: string, type: string): QuizFormat {
  const raw = String(value ?? "").toLowerCase();
  const allowed: QuizFormat[] = [
    "conceptual", "definition", "application", "scenario", "comparison",
    "problem", "formula", "factual",
  ];
  if (allowed.includes(raw as QuizFormat)) return raw as QuizFormat;
  if (type === "truefalse") return "factual";
  if (/\b(?:calculate|solve|find|compute)\b/i.test(prompt)) return "problem";
  if (/\b(?:compare|difference|unlike|whereas)\b/i.test(prompt)) return "comparison";
  if (/\b(?:scenario|student|situation|case)\b/i.test(prompt)) return "scenario";
  if (/\b(?:apply|use|example)\b/i.test(prompt)) return "application";
  if (/\b(?:define|definition|means)\b/i.test(prompt)) return "definition";
  return "conceptual";
}

function sanitizeAiQuestions(
  raw: unknown,
  count: number,
  context?: string,
  options?: GenerateQuizOptions,
): GeneratedQuestion[] {
  if (!Array.isArray(raw)) return [];

  const questions: GeneratedQuestion[] = [];
  const seen = new Set<string>();

  for (const entry of raw.slice(0, count * 3)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;

    // Reject an unsupported type instead of silently turning it into a
    // different type the student did not ask for.
    if (
      !QUIZ_QUESTION_TYPES.includes(
        String(record.type ?? "").toLowerCase() as QuizQuestionType,
      )
    ) {
      continue;
    }

    const question = normalizeQuizQuestion({
      type: record.type,
      prompt: record.prompt,
      options: record.options,
      correctAnswer: record.correctAnswer,
      pairs: record.pairs,
      explanation: record.explanation,
    });
    if (!question) continue;
    if (options?.questionTypes?.length && !options.questionTypes.includes(question.type)) {
      continue;
    }
    if (!isUsefulQuestionPrompt(question.prompt)) continue;
    if (question.type !== "match" && hasOcrNoise(question.correctAnswer)) continue;
    if (question.type === "mcq" && question.options.length !== 4) continue;
    if (question.type === "mcq" && question.options.some((option) => /all of the above|none of the above/i.test(option))) {
      continue;
    }
    if (question.type === "match" && question.options.length < 2) continue;
    if (question.explanation.length < 8) continue;

    const key = normalizeAnswer(question.prompt);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    questions.push({
      ...question,
      format: normalizeQuizFormat(record.format, question.prompt, question.type),
      topicLabel: cleanCardText(record.topicLabel ?? record.topic ?? context, 80),
      sourceRef: cleanCardText(record.sourceRef ?? record.source, 120),
      difficulty: normalizeDifficulty(record.difficulty, options?.difficulty),
    });
    if (questions.length >= count) break;
  }

  return questions;
}

export async function summarizeNotes(title: string, content: string) {
  const prompt = [
    `Summarise these study notes under the heading "${title}".`,
    "Return a short revision summary with: a 2-sentence overview, 3-5 key bullet points, and one exam-style takeaway.",
    "Use simple language and bold key terms. Do not invent anything that is not in the notes.",
    "Ignore page numbers, headers and OCR noise.",
    "",
    "NOTES:",
    content.slice(0, 8000),
  ].join("\n");

  const ai = await generateText(prompt, SYSTEM_TUTOR, 1200);
  return ai ?? localSummary(title, content);
}

/**
 * Turns the content-understanding stage into a compact brief the generator
 * prompts can lean on: the document's outline, the concepts **as the notes
 * define them**, and the relations between them. This is what lets the AI ask
 * university-teacher questions about the material instead of rephrasing
 * sentences as statement blocks.
 */
function studyBriefOf(study: ContentStudy, maxItems = 14): string {
  const parts: string[] = [];
  if (study.outline.length > 0) {
    parts.push(`Outline of the material (cover all of these sections): ${study.outline.slice(0, maxItems).join(" | ")}.`);
  }
  const concepts = study.concepts
    .slice(0, maxItems)
    .map((concept) =>
      concept.meaning?.trim()
        ? `${concept.term} — ${concept.meaning.trim()}`
        : concept.term,
    );
  if (concepts.length > 0) {
    parts.push(`Key concepts as the notes explain them: ${concepts.join("; ")}.`);
  }
  if (study.relations?.length) {
    parts.push(`How they connect: ${study.relations.slice(0, 6).join("; ")}.`);
  }
  return parts.join("\n");
}

const CARD_SCHEMA = {
  type: "OBJECT",
  properties: {
    cards: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          front: { type: "STRING" },
          back: { type: "STRING" },
          format: {
            type: "STRING",
            enum: [
              "concept",
              "definition",
              "explanation",
              "comparison",
              "application",
              "process",
              "formula",
            ],
          },
          topicLabel: { type: "STRING" },
          sourceRef: { type: "STRING" },
          difficulty: { type: "STRING", enum: ["easy", "medium", "hard"] },
        },
        required: ["front", "back", "format", "topicLabel"],
      },
    },
  },
  required: ["cards"],
};

async function requestCards(
  material: string,
  count: number,
  context?: string,
  correction?: string,
  focusTerms?: string[],
  brief?: string,
): Promise<GeneratedCard[]> {
  const prompt = [
    context ? `Context: ${context}` : "",
    correction ? `Your previous cards were unusable: ${correction}. Fix that and try again.` : "",
    `Create up to ${count} high-quality revision flashcards from the MATERIAL below.`,
    "You are making cards the way a university teacher drills students: first read and understand the material, then test the understanding — never restate sentence blocks as questions.",
    "Use only facts that are explicitly present in the material. Never add outside facts.",
    focusTerms?.length
      ? `Focus especially on these key concepts identified while studying the material: ${focusTerms.join(", ")}.`
      : "",
    brief
      ? `UNDERSTANDING built from studying the whole document (treat it as the map of what matters — spread the cards across every section and concept, and use it to ask about relationships, processes and applications, not just isolated definitions):\n${brief}`
      : "",
    "The material may be OCR text from a handwritten photo or scan: ignore page numbers, headers, stray symbols and broken words.",
    "Cover the IMPORTANT topics across the whole material — a card per major concept, mechanism, cause/effect, comparison or application that a teacher would test. Do not burn the count on trivial details.",
    "Each card must test exactly one concept and be understandable on its own.",
    "Use only these formats: concept → definition, term → explanation, question → answer, process → steps, comparison → differences, formula → meaning/application, concept → example.",
    "FRONT: a specific question or a clear term/concept prompt. Prefer asking how/why/compare/apply questions that check understanding, not just recall. Never use vague prompts such as 'What is the key idea here?'.",
    "Never create fill-in-the-blank or cloze cards, never delete a random word from a sentence, never copy a sentence from the material and blank or reword it into a 'statement question'.",
    "BACK: a complete, self-contained answer of 25 words or fewer. Do not answer with a bare heading or a fragment.",
    "Give each card a short topicLabel (the chapter/subtopic it came from) and a sourceRef when the material shows a page or section.",
    "Do not duplicate or near-duplicate a card. If the material is too short or unclear, return fewer cards instead of inventing content.",
    "",
    "MATERIAL:",
    material,
  ]
    .filter(Boolean)
    .join("\n");

  const ai = await generateJson<{ cards: unknown[] }>(
    prompt,
    SYSTEM_TUTOR,
    CARD_SCHEMA,
    2600,
  );

  return sanitizeAiCards(ai?.cards, count, context);
}

export async function makeFlashcards(
  source: string,
  count = 8,
  context?: string,
  onProgress?: (update: GenerationProgress) => void | Promise<void>,
): Promise<GeneratedCard[]> {
  const safeCount = Math.min(20, Math.max(1, count));
  const chunks = splitSource(source);

  if (chunks.length === 0) return [];

  const emit = async (update: GenerationProgress) => {
    try {
      await onProgress?.(update);
    } catch {
      // Progress reporting must never break generation.
    }
  };

  await emit({ stage: "Reading your material", progress: 6 });

  // MANDATORY content-understanding stage: study every selected note (whole
  // document) and build a structured understanding before writing anything.
  // Material without enough readable content raises a clear error here,
  // instead of producing invented or empty practice material.
  const study: ContentStudy = await studyContent(source);

  const focusTerms = study.concepts
    .slice(0, 12)
    .map((concept) => concept.term);
  const brief = studyBriefOf(study);

  await emit({
    stage:
      study.outline.length > 0
        ? `Studied ${study.outline.length} sections — ${focusTerms.length} key concepts understood`
        : `Studied the material — ${focusTerms.length} key concepts understood`,
    progress: 10,
  });

  const selected = sampleChunks(
    chunks,
    // Under a ~5 requests/minute free quota, at most two AI batches are sent;
    // the local generator samples the whole document for the remaining slots.
    Math.min(2, Math.max(1, Math.ceil(safeCount / 2))),
  );
  const distribution = distribute(safeCount, selected.length);

  await emit({
    stage:
      selected.length > 1
        ? `Reading ${selected.length} sections across the document`
        : "Finding the key ideas",
    progress: 12,
  });

  let finished = 0;
  const batches = await mapWithConcurrency(selected, 3, async (chunk, index) => {
    await emit({
      stage: `Writing cards from section ${index + 1} of ${selected.length}`,
      progress: 15 + Math.round((finished / selected.length) * 62),
      produced: finished,
    });

    const wanted = Math.min(20, distribution[index] + 2);

    // A failed or quota-aborted batch (429/5xx) contributes nothing and the
    // local generator tops the deck up below — repeating the call would only
    // waste more of the tiny request budget.
    let cards: GeneratedCard[] = [];
    try {
      cards = await requestCards(chunk, wanted, context, undefined, focusTerms, brief);
    } catch (error) {
      console.error(
        `[nova] Card batch ${index + 1} failed; that part falls back to local generation:`,
        error instanceof Error ? error.message : error,
      );
    }

    finished += 1;
    await emit({
      stage: `Checked section ${finished} of ${selected.length}`,
      progress: 15 + Math.round((finished / selected.length) * 62),
      produced: finished,
    });

    return cards;
  });

  await emit({ stage: "Removing duplicates and weak cards", progress: 82 });

  const cards = dedupeCards(batches.flat());
  if (cards.length >= safeCount) {
    await emit({ stage: "Ready to save", progress: 92, produced: cards.length });
    return cards.slice(0, safeCount);
  }

  // Top up from the local generator, which also samples the whole source.
  await emit({ stage: "Filling any gaps from the full document", progress: 88 });
  const toppedUp = dedupeCards([
    ...cards,
    ...localCards(source, safeCount, context),
  ]).slice(0, safeCount);

  await emit({ stage: "Ready to save", progress: 92, produced: toppedUp.length });
  return toppedUp;
}

const QUESTION_SCHEMA = {
  type: "OBJECT",
  properties: {
    questions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          type: {
            type: "STRING",
            enum: [
              "mcq", "truefalse", "match",
              "short", "long", "application", "problem",
            ],
          },
          format: {
            type: "STRING",
            enum: [
              "conceptual", "definition", "application", "scenario",
              "comparison", "problem", "formula", "factual",
            ],
          },
          prompt: { type: "STRING" },
          options: { type: "ARRAY", items: { type: "STRING" } },
          correctAnswer: { type: "STRING" },
          pairs: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                left: { type: "STRING" },
                right: { type: "STRING" },
              },
              required: ["left", "right"],
            },
          },
          explanation: { type: "STRING" },
          topicLabel: { type: "STRING" },
          sourceRef: { type: "STRING" },
          difficulty: { type: "STRING", enum: ["easy", "medium", "hard"] },
        },
        required: ["type", "prompt", "explanation", "format", "topicLabel"],
      },
    },
  },
  required: ["questions"],
};

async function requestQuestions(
  material: string,
  count: number,
  context?: string,
  options?: GenerateQuizOptions,
  correction?: string,
  focusTerms?: string[],
  brief?: string,
): Promise<GeneratedQuestion[]> {
  const difficulty = options?.difficulty ?? "medium";
  const formats = options?.formats?.length
    ? options.formats
    : ["conceptual", "definition", "application", "scenario", "comparison", "problem", "formula", "factual"];
  const types = options?.questionTypes?.length
    ? options.questionTypes
    : QUIZ_QUESTION_TYPES;

  const prompt = [
    context ? `Context: ${context}` : "",
    correction ? `Your previous questions were unusable: ${correction}. Fix that and try again.` : "",
    `Create up to ${count} ${difficulty}-difficulty exam-style questions from the MATERIAL below.`,
    "You are a university teacher setting an exam paper from this material: read and UNDERSTAND the notes first, then design questions that test conceptual understanding, reasoning, relationships and application — the way real exam questions are written.",
    "NEVER treat the material as a block of statements: a bad question copies a sentence and strips or rewords it into a claim. Instead ask why things work, how processes unfold, what follows, when to apply each idea, how two concepts differ or connect, or where the theory breaks.",
    "Every question must be answerable ONLY from this material, and its explanation must cite the fact from the material it rests on.",
    "Use only facts explicitly present in the material. Never add outside facts.",
    focusTerms?.length
      ? `Focus especially on these key concepts identified while studying the material: ${focusTerms.join(", ")}.`
      : "",
    brief
      ? `UNDERSTANDING built from studying the whole document (treat it as the map of what matters — spread the questions across every section and concept; use it to write why/how/how-would-you-apply questions and distractors grounded in that map):\n${brief}`
      : "",
    "The material may be OCR text from a handwritten photo or scan: ignore page numbers, headers, stray symbols and broken words.",
    "Spread the questions across the IMPORTANT topics of the material like a balanced question paper — do not cluster them all on one section or on trivial details.",
    `Use a balanced mix of these question formats: ${formats.join(", ")}.`,
    `Allowed answer types: ${types.join(", ")}. Use ONLY these types — never add a type the student did not select.`,
    "Never create fill-in-the-blank, cloze, or word-deletion questions. Never delete a random word from a sentence to make a question.",
    "Every question must test one clear idea, not trivia or filler.",
    "",
    "STRICT FORMAT RULES:",
    "- mcq: exactly 4 plausible options. Only one is correct. Three options must be realistic distractors from the same domain (typically: common misconceptions stated in the student's own notes, close variations, or near-misses). correctAnswer must be copied exactly from one of the options. Do not use 'All of the above' or 'None of the above'.",
    "- truefalse: options must be [\"True\", \"False\"] and correctAnswer must be exactly \"True\" or \"False\". The prompt should be a checkable statement whose truth requires understanding, not just matching a sentence.",
    "- match: provide a `pairs` array with 3-5 {left, right} objects. Left items are terms; right items are their meanings. options must be [] and correctAnswer may be a short summary. Do not put the mapping in options.",
    "- short: options must be [] and correctAnswer should be a concise model answer.",
    "- long: options must be [] and correctAnswer should be a full model answer or marking guide (2-4 sentences).",
    "- application: options must be [] and correctAnswer should be a marking guide describing the expected applied reasoning.",
    "- problem: options must be [] and correctAnswer should be a worked solution or step-by-step marking guide.",
    "- Every question needs a one-sentence explanation that cites the fact from the material.",
    "- Give each question a topicLabel (chapter/subtopic) and a sourceRef when the material shows a page or section.",
    "- Do not duplicate or near-duplicate a question. If the material cannot support enough questions, return fewer rather than inventing content.",
    "- If the material cannot support a requested answer type, omit that type. Never replace it with a different, unselected type.",
    "",
    "MATERIAL:",
    material,
  ]
    .filter(Boolean)
    .join("\n");

  const ai = await generateJson<{ questions: unknown[] }>(
    prompt,
    SYSTEM_TUTOR,
    QUESTION_SCHEMA,
    4200,
  );

  return sanitizeAiQuestions(ai?.questions, count, context, options);
}

export async function makeQuiz(
  source: string,
  count = 5,
  context?: string,
  options?: GenerateQuizOptions,
): Promise<GeneratedQuestion[]> {
  const safeCount = Math.min(20, Math.max(1, count));
  const chunks = splitSource(source);

  if (chunks.length === 0) return [];

  // MANDATORY content-understanding stage: the whole selection (every joined
  // note) is studied first; insufficient material raises a clear error
  // instead of generating invented questions.
  const study = await studyContent(source);
  const focusTerms = study.concepts
    .slice(0, 12)
    .map((concept) => concept.term);
  const brief = studyBriefOf(study);

  const selected = sampleChunks(
    chunks,
    // At most two AI quiz batches per generation; the local generator fills
    // every remaining slot from the whole document.
    Math.min(2, Math.max(1, Math.ceil(safeCount / 2))),
  );
  const distribution = distribute(safeCount, selected.length);

  const batches = await mapWithConcurrency(selected, 3, async (chunk, index) => {
    const wanted = Math.min(20, distribution[index] + 1);

    // A failed or quota-aborted batch contributes nothing; the local
    // generator tops the quiz up below.
    let questions: GeneratedQuestion[] = [];
    try {
      questions = await requestQuestions(
        chunk,
        wanted,
        context,
        options,
        undefined,
        focusTerms,
        brief,
      );
    } catch (error) {
      console.error(
        `[nova] Quiz batch ${index + 1} failed; that part falls back to local generation:`,
        error instanceof Error ? error.message : error,
      );
    }

    return questions;
  });

  const questions = dedupeQuestions(batches.flat());
  if (questions.length >= safeCount) return questions.slice(0, safeCount);

  return dedupeQuestions([
    ...questions,
    ...localQuiz(source, safeCount, context, options),
  ]).slice(0, safeCount);
}

export async function explainConcept(concept: string, context?: string) {
  const prompt = [
    `Explain "${concept}" to a student in simple language.`,
    context ? `Use this context if helpful:\n${context.slice(0, 3000)}` : "",
    "Structure: 1) a one-line plain-English definition, 2) an everyday analogy, 3) a tiny example, 4) one check-your-understanding question.",
    "Keep it under 220 words.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const ai = await generateText(prompt, SYSTEM_TUTOR, 900);
  return (
    ai ??
    [
      `**${concept} — simple version**`,
      "",
      `Think of ${concept} as a small machine: it takes something in, follows a rule, and gives a result.`,
      "",
      "**Analogy**",
      `It is a bit like following a recipe — the ingredients are your inputs, and the steps are the rule.`,
      "",
      "**Check yourself**",
      `Can you describe ${concept} to a friend in one sentence without using the word "${concept}"?`,
      "",
      "_Demo mode: add a Gemini API key in `.env.local` for a full, personalised explanation._",
    ].join("\n")
  );
}

const DEMO_TOPIC_ANSWERS: { match: RegExp; lines: string[] }[] = [
  {
    match: /discriminant|quadratic|factoris|roots/i,
    lines: [
      "**Hint first**",
      "The discriminant is the part under the square root in the quadratic formula: **b² − 4ac**. It tells you how many real roots exist *before* you solve anything.",
      "",
      "**How to use it**",
      "Positive → two real roots. Zero → one repeated root. Negative → no real roots (the graph never crosses the x-axis).",
      "",
      "**Tiny example**",
      "For x² + 4x + 5: b² − 4ac = 16 − 20 = −4. Negative, so there are no real roots.",
      "",
      "**Check yourself**",
      "What is the discriminant of x² − 5x + 6, and what does it tell you about the roots?",
    ],
  },
  {
    match: /mitosis|meiosis|cell division|chromosome/i,
    lines: [
      "**Hint first**",
      "Ask yourself one question: is the cell making a copy of itself, or making a gamete? That decides mitosis vs meiosis.",
      "",
      "**The short version**",
      "Mitosis: one division → two genetically identical diploid cells. Used for growth and repair. Meiosis: two divisions → four genetically different haploid cells. Used for gametes.",
      "",
      "**Memory hook**",
      "**PMAT** for the stages: Prophase, Metaphase, Anaphase, Telophase. Meiosis has PMAT twice.",
      "",
      "**Check yourself**",
      "Why does crossing over only matter in meiosis, not mitosis?",
    ],
  },
  {
    match: /covalent|ionic|bonding|bond|molecule|methane/i,
    lines: [
      "**Hint first**",
      "Look at what the atoms are doing with electrons: transferring them, sharing them, or pooling them.",
      "",
      "**The short version**",
      "Ionic = electrons transferred between a metal and a non-metal, forming a lattice of ions. Covalent = electrons shared between non-metals. Metallic = positive ions in a sea of delocalised electrons.",
      "",
      "**Why it matters**",
      "Ionic compounds conduct when molten because their ions are free to move. Simple covalent molecules have weak intermolecular forces, so low melting points.",
      "",
      "**Check yourself**",
      "Why is methane tetrahedral rather than square planar?",
    ],
  },
  {
    match: /photosynthesis|chlorophyll|glucose|oxygen/i,
    lines: [
      "**Hint first**",
      "Think of photosynthesis as the reverse of respiration — it stores energy instead of releasing it.",
      "",
      "**Word equation**",
      "Carbon dioxide + water → glucose + oxygen, using light energy and chlorophyll.",
      "",
      "**Where it happens**",
      "In the chloroplasts. Light-dependent reactions happen in the thylakoid membranes; the Calvin cycle happens in the stroma.",
      "",
      "**Check yourself**",
      "Name two things that would slow photosynthesis down, and explain why.",
    ],
  },
  {
    match: /cold war|marshall plan|berlin|soviet|nato/i,
    lines: [
      "**Hint first**",
      "Frame the Cold War as a contest of systems — capitalism vs communism — fought through alliances, proxy wars and propaganda rather than direct combat.",
      "",
      "**Key causes**",
      "Ideological differences, the post-war power vacuum in Europe, the atomic bomb, and mutual distrust at Yalta and Potsdam.",
      "",
      "**Turning points**",
      "Berlin Blockade (1948–49), NATO/Warsaw Pact, Cuban Missile Crisis (1962), détente, the fall of the Berlin Wall (1989).",
      "",
      "**Check yourself**",
      "Why did the Marshall Plan worry the Soviet Union?",
    ],
  },
  {
    match: /probabilit|chance|odds|dice/i,
    lines: [
      "**Hint first**",
      "Probability is favourable outcomes divided by total equally likely outcomes — but first check that the outcomes really are equally likely.",
      "",
      "**Quick rules**",
      "Impossible = 0, certain = 1. For independent events, multiply: P(A and B) = P(A) × P(B). For either/or, add and subtract the overlap.",
      "",
      "**Tiny example**",
      "One die: P(even) = 3/6 = 0.5. Two dice: P(both even) = 0.5 × 0.5 = 0.25.",
      "",
      "**Check yourself**",
      "What is the probability of drawing two red cards in a row from a standard deck without replacement?",
    ],
  },
  {
    match: /trig|sine rule|cosine rule|triangle|angle/i,
    lines: [
      "**Hint first**",
      "Ask what you have: two sides and the included angle? Cosine rule. A matching side-and-angle pair? Sine rule.",
      "",
      "**Sine rule**",
      "a / sin A = b / sin B = c / sin C.",
      "",
      "**Cosine rule**",
      "a² = b² + c² − 2bc cos A.",
      "",
      "**Check yourself**",
      "In a triangle, a = 7, b = 9 and angle C = 60°. Which rule would you use to find side c?",
    ],
  },
];

export function demoChatReply(question: string, studentName = "friend") {
  const trimmed = question.trim();
  const topic = trimmed.replace(/[?.!]+$/, "").slice(0, 80) || "this topic";
  const matched = DEMO_TOPIC_ANSWERS.find((entry) => entry.match.test(trimmed));

  if (matched) {
    return [
      `Hey ${studentName}! Here is a hint-first walkthrough. 🌱`,
      "",
      ...matched.lines,
      "",
      "_I'm in Demo Mode, so this answer comes from a local topic library. Add a `GEMINI_API_KEY` to `.env.local` and I can answer anything about your own notes._",
    ].join("\n");
  }

  return [
    `Hey ${studentName}! Let's take **${topic}** one step at a time. 🌱`,
    "",
    "**Start with the big picture**",
    "Before memorising details, say out loud what this idea is *for*. If you can explain the purpose, the details stick faster.",
    "",
    "**A hint to get moving**",
    "Break the question into two smaller questions and answer the easier one first. What do you already know for sure?",
    "",
    "**Try this next**",
    "1. Write down one example in your own words.",
    "2. Turn it into a flashcard.",
    "3. Come back tomorrow and try it again — that is spaced repetition doing its job.",
    "",
    "_I'm in Demo Mode right now. Add a `GEMINI_API_KEY` to `.env.local` and I'll answer with full, topic-specific detail._",
  ].join("\n");
}

export function localChatReplyForNote(question: string, notes: string[]) {
  if (notes.length === 0) return demoChatReply(question);
  const snippet = notes[0].slice(0, 500);
  return [
    "Here is what your notes say that is most relevant:",
    "",
    `> ${snippet}`,
    "",
    "**How to use it**",
    "Turn the first sentence into a question, then answer it without looking. If you get stuck, the answer is usually in the sentence right after it.",
    "",
    "_Demo mode: add a `GEMINI_API_KEY` for a deeper answer built from all of your notes._",
  ].join("\n");
}
