import { generateJson, aiEnabled } from "@/lib/ai/gemini";
import {
  buildDocumentMap,
  bulletLead,
  collapseSpaces,
  type DocumentMap,
  type MapChapter,
} from "@/lib/files/document-map";
import { normalizeAnswer } from "@/lib/utils";

/**
 * Automatic syllabus extraction.
 *
 * The AI path is asked for a strict chapter → topic → subtopic tree. Every
 * returned name is then checked against the source text so the model cannot
 * invent a topic from the subject name alone. If the AI is unavailable, or the
 * response cannot be validated, a deterministic local parser reads headings,
 * numbered sections, bullets, definitions, formulas and processes from the
 * document instead. Both paths preserve the original chapter hierarchy.
 */

export type SyllabusKind =
  | "chapter"
  | "topic"
  | "subtopic"
  | "concept"
  | "definition"
  | "formula"
  | "process"
  | "problem";

export type SyllabusNode = {
  name: string;
  kind: SyllabusKind;
  chapter: string;
  sourceRef: string;
  difficulty: number;
  importance: number;
  estimatedMinutes: number;
  children: SyllabusNode[];
  /**
   * Indicates how the node was obtained.
   * - "explicit" – directly found on a syllabus or contents page.
   * - "inferred" – deduced from headings/structure.
   * - "manual" – added/edited by the user in the review UI.
   */
  origin: "explicit" | "inferred" | "manual";
  /** Confidence score (0‑100) for inferred nodes; undefined for explicit/manual. */
  confidence?: number;
};


export type SyllabusExtraction = {
  nodes: SyllabusNode[];
  engine: "ai" | "local";
  warnings: string[];
};

const KINDS = new Set<SyllabusKind>([
  "chapter",
  "topic",
  "subtopic",
  "concept",
  "definition",
  "formula",
  "process",
  "problem",
]);

const GENERIC_NAMES = new Set(
  [
    "introduction",
    "overview",
    "summary",
    "key concepts",
    "key ideas",
    "important topics",
    "study material",
    "general",
    "miscellaneous",
    "notes",
    "contents",
    "table of contents",
    "chapter",
    "unit",
    "topics",
    "revision",
    "practice",
    "exercises",
    "questions",
    "answers",
    "learning objectives",
    "objectives",
    "conclusion",
    "references",
    "bibliography",
    "refrences",
    "bibiliography",
    "works cited",
    "further reading",
    "suggested reading",
    "index",
    "appendix",
  ].map((value) => normalizeAnswer(value)),
);

export const BIBLIO_HEADING =
  /^(?:ref[er]{2,5}nces?|bib[li]{2,5}ography|works cited|further reading|literature cited|citations?)\b/i;

const STOPWORDS = new Set([
  "the", "and", "that", "this", "with", "from", "have", "were", "which", "there",
  "their", "about", "would", "could", "should", "because", "between", "through",
  "these", "those", "other", "after", "before", "while", "where", "when", "what",
  "into", "than", "then", "them", "they", "your", "also", "such", "more", "most",
  "some", "only", "very", "each", "does", "been", "being", "over", "under",
  "will", "shall", "must", "can", "may", "might", "using", "used", "use",
]);

/** A name ending in a connector word is a wrapped-phrase fragment
 * ("How Do You Read an Input From a"), not a topic. */
const CONNECTOR_TAIL_WORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "for", "with", "in", "on", "from",
  "by", "at", "as", "into", "via", "vs", "if", "then", "that", "which",
]);

/** Comma-list items that begin with these are sentence continuations, not
 *  topics of an official syllabus statement. */
const SENTENCE_CONTINUATIONS = new Set([
  "and", "or", "but", "since", "because", "so", "then", "thus", "hence",
  "when", "while", "whereas", "however", "also", "such", "for", "that",
  "this", "these", "those", "it", "they", "we", "you", "if", "not",
  "the", "a", "an",
]);

const HEADING_PATTERNS: { re: RegExp; depth: number }[] = [
  { re: /^#{1,2}\s+(.+)$/, depth: 1 },
  { re: /^#{3,4}\s+(.+)$/, depth: 2 },
  { re: /^#{5,6}\s+(.+)$/, depth: 3 },
  {
    re: /^(?:chapter|unit|module|part)\s*[-–:]?\s*([0-9IVXLC]+)\s*[:.\-–]\s*(.{2,90})$/i,
    depth: 1,
  },
  {
    re: /^(?:lesson|section)\s+([0-9IVXLC]+)\s*(?:[:.\-–]\s*|\s+)(.{2,90})$/i,
    depth: 2,
  },
  { re: /^([0-9]+(?:\.[0-9]+)+)[.)]?\s+(.{2,90})$/, depth: 2 },
];

const PAGE_MARKER =
  /^(?:-{2,}\s*)?(?:page|pg\.?|p\.)\s*(\d+)(?:\s*(?:of|\/)\s*\d+)?(?:\s*-{2,})?$/i;

const BULLET = /^\s*(?:[-*•·▪◦]+|\d+[.)]|[a-z][.)])\s+(.+)$/i;

const NOISE_LINE =
  /^(?:page|pg\.?)\s*\d+|^[\W\d_]+$|^\[?illegible\]?$|^https?:\/\//i;

const FORMULA_HINT = /[=≈≠≤≥∑√π∫±×÷^]|\b(?:formula|equation|theorem)\b/i;
const PROCESS_HINT = /→|->|\b(?:steps?|first|second|then|finally|stage|process|cycle)\b/i;
const PROBLEM_HINT = /^(?:example|problem|exercise|question|q)\s*\d*[:.)]?\s+/i;

function collapse(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function stripMarks(line: string) {
  return line
    .replace(/^\s*(?:[-*•·▪◦]+|\d+[.)]|[a-z][.)])\s+/i, "")
    .replace(/^#{1,6}\s+/, "")
    .trim();
}

function cleanName(value: unknown) {
  const name = collapse(String(value ?? ""))
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/^(?:the|a|an)\s+/i, "")
    .replace(/[.;:,]+$/g, "")
    .trim();

  if (name.length < 2 || name.length > 90) return null;
  if (NOISE_LINE.test(name)) return null;
  if (GENERIC_NAMES.has(normalizeAnswer(name))) return null;

  const words = name.split(/\s+/).filter(Boolean);
  if (words.length > 14) return null;
  if (!/[A-Za-z]/.test(name)) return null;
  if (words.length > 1 && CONNECTOR_TAIL_WORDS.has(words[words.length - 1].toLowerCase())) {
    return null;
  }
  if (isCoverBannerName(name)) return null;

  return name;
}

/**
 * Cover-page banners ("PYTHON PROGRAMMING", "AKTU SYLLABUS UNIT-1") are typed
 * in full caps by design, while real topic names almost always mix case — even
 * when they contain acronyms ("OSI Model", "DNA Replication"). Rejecting every
 * fully-capitalised multi-word name keeps those banner lines out of the topic
 * tree without hurting legitimate acronym topics.
 */
export function isCoverBannerName(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;

  let alphabetic = 0;
  let uppercase = 0;
  for (const word of words) {
    const letters = word.replace(/[^A-Za-z]/g, "");
    if (letters.length < 3) continue;
    alphabetic += 1;
    if (letters === letters.toUpperCase()) uppercase += 1;
  }
  return alphabetic >= 1 && uppercase === alphabetic;
}

function significantTokens(value: string) {
  return normalizeAnswer(value)
    .split(" ")
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));
}

/**
 * Rejects names that are not supported by the document. Short names need all
 * of their significant words to appear; longer names need at least 60%.
 */
export function isGroundedInSource(name: string, source: string) {
  const tokens = significantTokens(name);
  if (tokens.length === 0) return false;

  const haystack = new Set(significantTokens(source));
  if (haystack.size === 0) return false;

  const found = tokens.filter((token) => haystack.has(token)).length;
  if (tokens.length <= 2) return found === tokens.length;
  return found / tokens.length >= 0.6;
}

function isGenericName(name: string, context?: string) {
  const key = normalizeAnswer(name);
  if (!key || GENERIC_NAMES.has(key)) return true;
  if (context && key === normalizeAnswer(context)) return true;
  return false;
}

function difficultyFor(name: string, kind: SyllabusKind) {
  let score = 3;
  if (kind === "formula" || kind === "problem") score += 1;
  if (kind === "definition" || kind === "concept") score -= 1;
  if (/(?:calculate|derive|prove|analyse|analyze|evaluate|apply|solve)/i.test(name)) score += 1;
  if (name.split(/\s+/).length <= 2) score -= 1;
  return Math.min(5, Math.max(1, score));
}

function minutesFor(name: string, kind: SyllabusKind, children: number) {
  const base =
    kind === "chapter" ? 40 : kind === "formula" || kind === "problem" ? 50 : 35;
  const words = name.split(/\s+/).length;
  return Math.min(240, Math.max(20, base + words * 3 + children * 10));
}

function makeNode(params: {
  name: string;
  kind?: SyllabusKind;
  chapter?: string;
  sourceRef?: string;
  children?: SyllabusNode[];
  importance?: number;
  origin?: SyllabusNode["origin"];
  confidence?: number;
}): SyllabusNode {
  const kind = params.kind && KINDS.has(params.kind) ? params.kind : "topic";
  const children = params.children ?? [];
  const explicit = params.origin === "explicit" || params.origin === "manual";
  return {
    name: params.name,
    kind,
    chapter: params.chapter ?? (kind === "chapter" ? params.name : ""),
    sourceRef: params.sourceRef ?? "",
    difficulty: difficultyFor(params.name, kind),
    importance: Math.min(5, Math.max(1, params.importance ?? (kind === "chapter" ? 4 : 3))),
    estimatedMinutes: minutesFor(params.name, kind, children.length),
    children,
    origin: params.origin ?? "inferred",
    ...(explicit
      ? {}
      : {
          confidence: params.confidence ?? defaultConfidence(kind, params.sourceRef),
        }),
  };
}

/**
 * Deterministic confidence for locally-parsed nodes: numbered-section
 * headings from the document map are near-certain; bullet lead-ins are a
 * bit less so. Used wherever no AI confidence is available.
 */
function defaultConfidence(kind: SyllabusKind, sourceRef?: string) {
  if (kind === "chapter") return 95;
  if (/^p\.\s*\d+$/i.test(sourceRef ?? "")) return 90;
  return 75;
}

function inferKind(line: string, fallback: SyllabusKind = "topic"): SyllabusKind {
  if (PROBLEM_HINT.test(line)) return "problem";
  if (FORMULA_HINT.test(line)) return "formula";
  if (PROCESS_HINT.test(line)) return "process";
  if (/\b(?:is|are|means|refers to|defined as)\b/i.test(line)) return "definition";
  return fallback;
}

function dedupeNodes(nodes: SyllabusNode[]) {
  const seen = new Set<string>();
  const result: SyllabusNode[] = [];

  for (const node of nodes) {
    const key = normalizeAnswer(node.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    node.children = dedupeNodes(node.children);
    result.push(node);
  }

  return result;
}

/**
 * Validates AI output. Invalid/generic/ungrounded nodes are dropped, children
 * are re-parented sensibly, and empty chapters are removed.
 */
export function validateSyllabus(
  raw: unknown,
  source: string,
  context?: string,
): SyllabusNode[] {
  const chapters: SyllabusNode[] = [];

  const readChildren = (value: unknown): SyllabusNode[] => {
    if (!Array.isArray(value)) return [];
    const children: SyllabusNode[] = [];

    for (const entry of value.slice(0, 40)) {
      if (!entry) continue;
      if (typeof entry === "string") {
        const name = cleanName(entry);
        if (!name || isGenericName(name, context) || !isGroundedInSource(name, source)) continue;
        children.push(makeNode({ name, kind: inferKind(entry, "subtopic") }));
        continue;
      }

      if (typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const name = cleanName(record.name ?? record.title);
      if (!name || isGenericName(name, context) || !isGroundedInSource(name, source)) continue;

      const kindRaw = String(record.kind ?? "").toLowerCase();
      const kind = (KINDS.has(kindRaw as SyllabusKind) ? kindRaw : inferKind(name)) as SyllabusKind;
      const sourceRef = collapse(String(record.sourceRef ?? record.reference ?? "")).slice(0, 120);

      children.push(
        makeNode({
          name,
          kind,
          sourceRef,
          children: readChildren(record.subtopics ?? record.children),
        }),
      );
    }

    return dedupeNodes(children);
  };

  const rawChapters = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? ((raw as Record<string, unknown>).chapters ??
        (raw as Record<string, unknown>).topics ??
        [])
      : [];

  if (!Array.isArray(rawChapters)) return [];

  for (const entry of rawChapters) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;

    const title = cleanName(record.title ?? record.name ?? record.chapter);
    const children = readChildren(record.topics ?? record.subtopics ?? record.children);
    const sourceRef = collapse(String(record.sourceRef ?? record.reference ?? "")).slice(0, 120);

    if (title && !isGenericName(title, context) && isGroundedInSource(title, source)) {
      if (BIBLIO_HEADING.test(title)) continue;
      const chapter = makeNode({
        name: title,
        kind: "chapter",
        sourceRef,
        children,
      });
      chapters.push(chapter);
      continue;
    }

    // The model returned a flat list of topics rather than chapters.
    for (const child of children) {
      if (child.kind === "chapter") {
        chapters.push(child);
      } else {
        const name = cleanName(record.name ?? record.title);
        if (name && isGroundedInSource(name, source) && !isGenericName(name, context)) {
          chapters.push(makeNode({ name, kind: inferKind(name), children: [] }));
        }
      }
    }
  }

  return dedupeNodes(chapters).slice(0, 40);
}

/* ------------------------------------------------------------------ */
/* Local fallback                                                      */
/* ------------------------------------------------------------------ */

type ParsedLine = {
  raw: string;
  text: string;
  page: number | null;
  bullet: boolean;
  heading: { title: string; depth: number } | null;
};

function parseLines(source: string): ParsedLine[] {
  let page: number | null = null;
  const lines: ParsedLine[] = [];
  let inBiblio = false;

  const rawLines = source.replace(/\r/g, "").split("\n");
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i].trim();
    if (!raw) continue;

    const pageMatch = PAGE_MARKER.exec(raw);
    if (pageMatch) {
      page = Number(pageMatch[1]);
      continue;
    }

    const bulletMatch = BULLET.exec(raw);
    const withoutBullet = bulletMatch ? bulletMatch[1].trim() : raw;
    const text = stripMarks(withoutBullet);
    if (!text || NOISE_LINE.test(text)) continue;

    // References / Bibliography section start
    if (BIBLIO_HEADING.test(text)) {
      inBiblio = true;
      continue;
    }

    // Check for standalone chapter e.g. "CHAPTER-1", "CHAPTER 1", "Chapter I"
    const standaloneChapter = /^(?:chapter|unit|module|part)\s*[-–:]?\s*([0-9IVXLC]+)$/i.exec(text);
    if (standaloneChapter) {
      inBiblio = false; // new chapter resets biblio
      const nextRaw = rawLines[i + 1]?.trim() ?? "";
      let title = `Chapter ${standaloneChapter[1]}`;
      if (
        nextRaw &&
        nextRaw.length <= 90 &&
        !/^(?:chapter|unit|module|part)\s*[-–:]?\s*([0-9IVXLC]+)/i.test(nextRaw) &&
        !/^([0-9]+(?:\.[0-9]+)+)/.test(nextRaw) &&
        !BULLET.test(nextRaw) &&
        !/[.!?;]$/.test(nextRaw)
      ) {
        title = cleanName(nextRaw) ? cleanName(nextRaw)! : `Chapter ${standaloneChapter[1]}: ${stripMarks(nextRaw)}`;
        i++; // consume title line
      }
      lines.push({
        raw,
        text: title,
        page,
        bullet: false,
        heading: { title, depth: 1 },
      });
      continue;
    }

    if (inBiblio) {
      const maybeChapter = /^(?:chapter|unit|module|part)\s*[-–:]?\s*([0-9IVXLC]+)/i.test(text);
      if (maybeChapter) {
        inBiblio = false;
      } else {
        continue;
      }
    }

    let heading: { title: string; depth: number } | null = null;
    for (const pattern of HEADING_PATTERNS) {
      const match = pattern.re.exec(text);
      if (!match) continue;
      const title = cleanName(match[2] ?? match[1]);
      if (!title) continue;
      let depth = pattern.depth;
      if (/^[0-9]+(?:\.[0-9]+)+$/.test(match[1])) {
        const dots = match[1].split(".").length - 1;
        depth = dots >= 2 ? 3 : 2;
      }
      heading = { title, depth };
      break;
    }

    if (/^(?:table|figure|fig\.?)\s*\d+/i.test(text)) {
      continue;
    }

    // A short, title-cased line without sentence punctuation is usually a
    // section/topic heading (depth 2) in slides and handwritten notes.
    if (!heading && !bulletMatch && text.length <= 72 && !/[.!?;:]$/.test(text)) {
      const words = text.split(/\s+/).filter(Boolean);
      const capitalised = words.filter((word) => /^[A-Z0-9]/.test(word)).length;
      if (words.length >= 2 && words.length <= 8 && capitalised / words.length >= 0.6) {
        heading = { title: text, depth: 2 };
      }
    }

    lines.push({
      raw,
      text,
      page,
      bullet: Boolean(bulletMatch),
      heading,
    });
  }

  return lines;
}

function sourceRefFor(page: number | null, index: number) {
  if (page) return `p. ${page}`;
  return `line ${index + 1}`;
}

function topicFromLine(line: ParsedLine, index: number): SyllabusNode | null {
  const text = line.text;
  if (text.length > 110) return null;

  const words = text.split(/\s+/).filter(Boolean);
  // A wrapped continuation such as "second squared." is not a topic.
  if (!line.bullet && /^[a-z]/.test(text) && words.length <= 4) return null;

  const kind = inferKind(text);
  if (kind === "formula") {
    // Keep the quantity being defined ("Speed"), not the whole equation with
    // its explanatory clause.
    const left = cleanName(text.split(/[=≈≠≤≥]/)[0] ?? "");
    if (left && left.split(/\s+/).length <= 6) {
      return makeNode({
        name: left,
        kind: "formula",
        sourceRef: sourceRefFor(line.page, index),
      });
    }
    return null;
  }

  // "X is Y" / "X refers to Y" — keep the term, not the whole sentence.
  const definition =
    /^(.{2,70}?)\s+(?:is|are|means|refers to|is defined as|are defined as)\s+(.{8,})$/i.exec(
      text,
    );
  if (definition) {
    const term = cleanName(definition[1]);
    if (term) {
      return makeNode({
        name: term,
        kind: "definition",
        sourceRef: sourceRefFor(line.page, index),
      });
    }
  }

  if (kind === "problem") {
    return makeNode({
      name: collapse(text).slice(0, 90),
      kind: "problem",
      sourceRef: sourceRefFor(line.page, index),
    });
  }

  if (line.bullet || (kind === "process" && words.length >= 4)) {
    const name = cleanName(text.replace(/[.;:]$/, ""));
    if (!name) return null;
    return makeNode({
      name,
      kind,
      sourceRef: sourceRefFor(line.page, index),
    });
  }

  return null;
}

function keywordTopics(source: string, existing: Set<string>): SyllabusNode[] {
  const tokens = new Map<string, number>();
  for (const match of source.matchAll(/\b[A-Za-z][A-Za-z-]{4,}\b/g)) {
    const word = match[0];
    if (STOPWORDS.has(word.toLowerCase())) continue;
    tokens.set(word, (tokens.get(word) ?? 0) + 1);
  }

  return [...tokens.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([word]) => word)
    .filter((word) => !existing.has(normalizeAnswer(word)))
    .map((word) => makeNode({ name: word, kind: "concept", sourceRef: "" }));
}

/**
 * Deterministic fallback. It only keeps text that literally appears in the
 * document, so it cannot hallucinate a topic from the subject name.
 */
export function localSyllabus(source: string, context?: string): SyllabusNode[] {
  const lines = parseLines(
    source.replace(/\[\[page:\s*(\d+)\s*\]\]/gi, "Page $1"),
  );
  if (lines.length === 0) return [];

  const chapters: SyllabusNode[] = [];
  let currentChapter: SyllabusNode | null = null;
  let currentTopic: SyllabusNode | null = null;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line.heading) {
      // Heading titles take the same gates as every other candidate topic:
      // without this, cover banners ("PYTHON PROGRAMMING", "AKTU SYLLABUS
      // UNIT-1") arrive as markdown headings and skip cleanName entirely.
      const headingTitle = cleanName(line.heading.title);
      if (!headingTitle || isGenericName(headingTitle, context)) continue;
      if (line.heading.depth === 1) {
        currentChapter = makeNode({
          name: headingTitle,
          kind: "chapter",
          sourceRef: sourceRefFor(line.page, index),
          children: [],
        });
        chapters.push(currentChapter);
        currentTopic = null;
        continue;
      }
      if (line.heading.depth === 2) {
        if (!currentChapter) {
          currentChapter = makeNode({
            name: cleanName(context) ?? "Detected topics",
            kind: "chapter",
            sourceRef: sourceRefFor(line.page, index),
            children: [],
          });
          chapters.push(currentChapter);
        }
        currentTopic = makeNode({
          name: headingTitle,
          kind: "topic",
          chapter: currentChapter.name,
          sourceRef: sourceRefFor(line.page, index),
          children: [],
        });
        currentChapter.children.push(currentTopic);
        continue;
      }
      if (line.heading.depth === 3) {
        const subNode = makeNode({
          name: headingTitle,
          kind: "subtopic",
          chapter: currentChapter?.name ?? "",
          sourceRef: sourceRefFor(line.page, index),
          children: [],
        });
        if (currentTopic) {
          currentTopic.children.push(subNode);
        } else if (currentChapter) {
          currentChapter.children.push(subNode);
        } else {
          currentChapter = makeNode({
            name: cleanName(context) ?? "Detected topics",
            kind: "chapter",
            sourceRef: sourceRefFor(line.page, index),
            children: [subNode],
          });
          chapters.push(currentChapter);
        }
        continue;
      }
    }

    const item = topicFromLine(line, index);
    if (!item) continue;
    if (isGenericName(item.name, context)) continue;

    if (currentTopic) {
      item.chapter = currentChapter?.name ?? "";
      currentTopic.children.push(item);
    } else if (currentChapter) {
      item.chapter = currentChapter.name;
      currentChapter.children.push(item);
    } else {
      currentChapter = makeNode({
        name: cleanName(context) ?? "Detected topics",
        kind: "chapter",
        sourceRef: sourceRefFor(line.page, index),
        children: [item],
      });
      chapters.push(currentChapter);
    }
  }

  const chosen = [...chapters];

  const existing = new Set<string>();
  for (const chapter of chosen) {
    existing.add(normalizeAnswer(chapter.name));
    for (const child of chapter.children) existing.add(normalizeAnswer(child.name));
  }

  if (chosen.length === 0) {
    // Official-syllabus statements ("Unit-1: A, B, C.") are the strongest
    // structured source in an otherwise heading-less document — try them
    // before the weak keyword fallback. Without this, a one-unit official
    // syllabus screenshot degraded to a chapter named after the SUBJECT and
    // a single keyword ("miniproject" → "Python") as its only topic.
    const statements = statementChapters(source, context);
    if (statements.length > 0) {
      chosen.push(...statements);
    } else {
      const chapter = makeNode({
        name: cleanName(context) ?? "Detected topics",
        kind: "chapter",
        children: keywordTopics(source, existing),
      });
      if (chapter.children.length > 0) chosen.push(chapter);
    }
  }

  return dedupeNodes(chosen)
    .map((chapter) => ({
      ...chapter,
      children: dedupeNodes(chapter.children).slice(0, 30),
      chapter: chapter.name,
    }));
}

/* ------------------------------------------------------------------ */
/* AI path                                                             */
/* ------------------------------------------------------------------ */

const MAX_CHUNK_CHARS = 7_000;

function splitSource(source: string, maxChars = MAX_CHUNK_CHARS) {
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
      paragraph.length > maxChars ? paragraph.split(/(?<=[.!?])\s+/) : [paragraph];

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

const SYSTEM_SYLLABUS =
  "You are an expert curriculum analyst. You extract the structure that is actually " +
  "present in a student's notes. You never invent topics, never use the subject name as " +
  "a topic, and never pad the list with generic headings. You preserve chapter hierarchy " +
  "and quote a page/passage reference when the text provides one.";

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    chapters: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          sourceRef: { type: "STRING" },
          topics: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING" },
                kind: {
                  type: "STRING",
                  enum: [
                    "topic",
                    "subtopic",
                    "concept",
                    "definition",
                    "formula",
                    "process",
                    "problem",
                  ],
                },
                sourceRef: { type: "STRING" },
                subtopics: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      name: { type: "STRING" },
                      kind: { type: "STRING" },
                      sourceRef: { type: "STRING" },
                    },
                    required: ["name"],
                  },
                },
              },
              required: ["name"],
            },
          },
        },
        required: ["title"],
      },
    },
  },
  required: ["chapters"],
};

async function requestChunkSyllabus(
  material: string,
  context: string | undefined,
  correction?: string,
) {
  const prompt = [
    context ? `Subject/context: ${context}` : "",
    correction
      ? `Your previous response was unusable: ${correction}. Fix that and try again.`
      : "",
    "Extract the syllabus structure from the MATERIAL below.",
    "Rules:",
    "- Use only headings, numbered sections, bullet lists, definitions, formulas, processes and problems that are explicitly present.",
    "- Do not create a topic from the subject name or from general knowledge.",
    "- Preserve hierarchy: chapters contain topics; topics may contain subtopics.",
    "- Name each item exactly as the material names it, without adding adjectives.",
    "- Include a sourceRef such as \"p. 12\" or \"Unit 2\" only when the material shows one.",
    "- Return fewer items rather than guessing. If the material has no structure, return an empty chapters array.",
    "",
    "MATERIAL:",
    material,
  ]
    .filter(Boolean)
    .join("\n");

  return generateJson<unknown>(prompt, SYSTEM_SYLLABUS, RESPONSE_SCHEMA, 3600);
}

function mergeChapters(target: SyllabusNode[], incoming: SyllabusNode[]) {
  const byName = new Map(target.map((chapter) => [normalizeAnswer(chapter.name), chapter]));

  for (const chapter of incoming) {
    const key = normalizeAnswer(chapter.name);
    const existing = byName.get(key);
    if (!existing) {
      target.push(chapter);
      byName.set(key, chapter);
      continue;
    }

    const childKeys = new Set(existing.children.map((child) => normalizeAnswer(child.name)));
    for (const child of chapter.children) {
      if (!childKeys.has(normalizeAnswer(child.name))) {
        existing.children.push(child);
        childKeys.add(normalizeAnswer(child.name));
      }
    }
  }

  return target;
}

/* ------------------------------------------------------------------ */
/* Map-driven per-chapter extraction (full-document coverage)          */
/* ------------------------------------------------------------------ */

/**
 * Compact per-chapter material for the AI prompt: page markers are reduced to
 * one "[p. N]" tag when the page changes, so the model can cite real pages
 * without the newline noise of per-line markers.
 */
function compactChapterMaterial(chapter: MapChapter) {
  let lastPage: number | null = null;
  const lines: string[] = [];
  for (const line of chapter.raw.split("\n")) {
    const marker = /^\[\[page:\s*(\d+)\s*\]\]$/.exec(line.trim());
    if (marker) {
      const page = Number(marker[1]);
      if (page !== lastPage) {
        lines.push(`[p. ${page}]`);
        lastPage = page;
      }
      continue;
    }
    if (line.trim()) lines.push(line);
  }
  return lines.join("\n").slice(0, MAX_CHUNK_CHARS * 2);
}

/**
 * Deterministic topics for one mapped chapter: every numbered section becomes
 * a topic, bullet lead-ins become subtopics. Because these strings literally
 * come from the document, they are the guaranteed baseline — the chapter can
 * never disappear, whichever model ingests it.
 */
function mapChapterTopicNodes(chapter: MapChapter, context?: string): SyllabusNode[] {
  const topics: SyllabusNode[] = [];

  const pushTopic = (
    name: string,
    kind: SyllabusKind,
    sourceRef: string,
    bulletTexts: { text: string; page: number | null }[],
  ) => {
    const clean = cleanName(name);
    if (!clean || isGenericName(clean, context)) return;

    const topic = makeNode({
      name: clean,
      kind,
      chapter: chapter.label,
      sourceRef,
      children: [],
    });

    const seen = new Set<string>([normalizeAnswer(clean)]);
    for (const bullet of bulletTexts) {
      const bulletName = bulletLead(bullet.text);
      if (!bulletName || seen.has(normalizeAnswer(bulletName))) continue;
      if (isGenericName(bulletName, context) || !isGroundedInSource(bulletName, chapter.raw)) {
        continue;
      }
      seen.add(normalizeAnswer(bulletName));
      topic.children.push(
        makeNode({
          name: bulletName,
          kind: inferKind(bullet.text, "subtopic"),
          chapter: chapter.label,
          sourceRef: bullet.page ? `p. ${bullet.page}` : "",
        }),
      );
    }

    topics.push(topic);
  };

  for (const section of chapter.sections) {
    pushTopic(
      section.title,
      "topic",
      section.page ? `p. ${section.page}` : "",
      section.bullets.slice(0, 30),
    );
  }

  // Chapters with no sections at all: the chapter title becomes the topic and
  // its intro bullets (if any) become subtopics.
  if (topics.length === 0) {
    pushTopic(
      chapter.title,
      "topic",
      chapter.startPage ? `p. ${chapter.startPage}` : "",
      chapter.introBullets ?? [],
    );
  }

  // An official-syllabus statement in the chapter's own intro ("Unit-1:
  // A, B, C.") is the best structured source of the unit's topics — put
  // these first; section topics follow beneath (dedupe keeps one).
  const statementTopics = officialSyllabusTopics(
    chapter.introBody,
    chapter.raw,
    context,
  );
  const byKey = new Set(statementTopics.keys());
  const sectionTopics = topics.filter(
    (topic) => !byKey.has(normalizeAnswer(topic.name)),
  );
  return [...statementTopics.values(), ...sectionTopics];
}

/** A standalone "Unit-1"-style lead names the unit, not a topic. */
const STANDALONE_UNIT_MARKER =
  /^(?:chapter|unit|module|part)\s*[-–]?\s*([0-9IVXLC]+)$/i;

type ParsedStatement = {
  lead: string;
  page: number | null;
  items: { name: string; page: number | null }[];
};

/**
 * Cover-banner words glued in front of the real lead ("PYTHON PROGRAMMING
 * AKTU SYLLABUS UNIT-1 Introduction to Python") are stripped off — but only
 * while every dropped word is fully capitalised AND at least two words stay,
 * so a legitimately all-caps lead is never mutilated into one word.
 */
function stripBannerLeadPrefix(leadRaw: string): string {
  const words = leadRaw.split(/\s+/).filter(Boolean);
  let start = 0;
  while (
    start < words.length - 1 &&
    /^[A-Z0-9][A-Z0-9\-–—.]*$/.test(words[start]) &&
    words.length - (start + 1) >= 2
  ) {
    start += 1;
  }
  return words.slice(start).join(" ");
}

/** Parses one collapsed statement into its lead and its topic items. */
function parseStatement(
  text: string,
  page: number | null,
  source: string,
  context?: string,
): ParsedStatement | null {
  if (text.length < 40 || text.length > 500) return null;

  const head = text.indexOf(":");
  if (head < 3 || head > 90) return null;
  const leadRaw = text.slice(0, head);
  const bodyRaw = text.slice(head + 1);
  const leadWords = leadRaw.split(/\s+/).filter(Boolean);
  if (leadWords.length > 9) return null;

  // Split on sentence boundaries and commas.
  const items = bodyRaw
    .split(/(?<=[^0-9])\.|,|;/)
    .map((item) => item.replace(/^(?:and|or|the|an|a)\s+/i, "").trim())
    .filter(Boolean);

  const accepted: { name: string; page: number | null }[] = [];
  for (const item of items) {
    if (/^(?:etc|i\.e|e\.g)\b/i.test(item)) continue;
    // "Numeric data types: int, float etc." — the trailing "etc." list is
    // the nested detail of the previous item, not a topic of its own.
    if (/\betc\.?\s*$/i.test(item)) continue;
    if (item.length < 3 || item.length > 70) continue;
    const words = item.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 10) continue;
    // Real syllabus items are noun phrases, not code/prose fragments.
    if (/["'`“”(){}[\]]/.test(item)) continue;
    if (SENTENCE_CONTINUATIONS.has(words[0].toLowerCase())) continue;
    // A nested "Name: detail" statement introduces its own topic; the
    // detail ("int, float etc.") is dropped.
    const nested = item.indexOf(":");
    const name = nested > 2 ? item.slice(0, nested) : item;
    const clean = cleanName(name);
    if (!clean || isGenericName(clean, context)) continue;
    if (!isGroundedInSource(clean, source)) continue;
    accepted.push({ name: clean, page });
  }

  // A single accepted item is more likely a prose definition than a
  // syllabus statement — require at least two real topics.
  if (accepted.length < 2) return null;

  // "Unit-1" as the lead names the unit, not a topic — normalise it so the
  // chapter gets a readable title instead of a bare number token.
  const unitLead = STANDALONE_UNIT_MARKER.exec(leadRaw.trim());
  const leadClean = cleanName(
    unitLead ? `Unit ${unitLead[1]}` : stripBannerLeadPrefix(leadRaw),
  );
  if (!leadClean) return null;
  return { lead: leadClean, page, items: accepted };
}

/**
 * Runs the statement parser over candidate blocks (document lines or
 * paragraphs), buffering wrapped statements until their final full stop.
 * Cover banners and standalone unit markers are noise here, never leads.
 */
function eachSyllabusStatement(
  blocks: { text: string; page: number | null }[],
  source: string,
  context: string | undefined,
  budget: number,
  visit: (statement: ParsedStatement) => void,
) {
  let remaining = budget;
  let buffer = "";
  let bufferPage: number | null = null;

  const flush = () => {
    const text = buffer;
    const page = bufferPage;
    buffer = "";
    bufferPage = null;
    if (remaining <= 0) return;
    const statement = parseStatement(text, page, source, context);
    if (!statement) return;
    remaining -= 1;
    visit(statement);
  };

  for (const block of blocks) {
    if (remaining <= 0 && !buffer) break;

    const lines = block.text
      .replace(/\r/g, "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter(
        (line) =>
          !isCoverBannerName(line) &&
          !NOISE_LINE.test(line) &&
          !STANDALONE_UNIT_MARKER.test(line),
      );
    const text = collapseSpaces(lines.join(" "));
    if (!text) continue;

    if (!buffer) {
      const head = text.indexOf(":");
      if (head < 3 || head > 90 || text.length < 40) continue;
      buffer = text;
      bufferPage = block.page;
    } else {
      buffer += ` ${text}`;
    }
    // A wrapped statement continues until its final full stop.
    if (/[.]$/.test(buffer) || buffer.length > 500) flush();
  }
  flush();
}

/**
 * Splits a note into candidate statement blocks, tracking both marker styles
 * the pipeline produces ("[[page: 7]]" and plain "Page 7" lines).
 */
function statementBlocks(source: string) {
  const blocks: { text: string; page: number | null }[] = [];
  let page: number | null = null;
  let current: string[] = [];

  const push = () => {
    if (current.length > 0) {
      blocks.push({ text: current.join("\n"), page });
      current = [];
    }
  };

  for (const rawLine of source.replace(/\r/g, "").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const pageMatch =
      /^\[\[page:\s*(\d+)\s*\]\]$/.exec(line) ?? PAGE_MARKER.exec(line);
    if (pageMatch) {
      push();
      page = Number(pageMatch[1]);
      continue;
    }
    current.push(line);
  }
  push();
  return blocks;
}

/**
 * Statement chapters for documents without a chapter map: every official
 * syllabus statement ("Unit-1: A, B, C.") becomes one chapter named by its
 * lead, with the comma-separated items as its topics. This is the
 * deterministic answer for single-unit official-syllabus uploads — it works
 * identically whether the AI is available or not.
 */
export function statementChapters(
  source: string,
  context?: string,
): SyllabusNode[] {
  const chapters: SyllabusNode[] = [];

  eachSyllabusStatement(
    statementBlocks(source),
    source,
    context,
    8,
    (statement) => {
      chapters.push(
        makeNode({
          name: statement.lead,
          kind: "chapter",
          sourceRef: statement.page ? `p. ${statement.page}` : "",
          children: statement.items.map((item) =>
            makeNode({
              name: item.name,
              kind: "topic",
              chapter: statement.lead,
              sourceRef: item.page ? `p. ${item.page}` : "",
            }),
          ),
        }),
      );
    },
  );

  return dedupeNodes(chapters);
}

/**
 * Official syllabus statements look like
 * "Introduction to Python: Python variables, Python basic Operators,
 *  Understanding python blocks. Data Types: int, float etc."
 * The lead ("Introduction to Python") names the unit; the comma-separated
 * items are its topics. This parser turns such a statement into real topics
 * with the page reference of the block it came from.
 */
export function officialSyllabusTopics(
  introBody: { text: string; page: number | null }[],
  source: string,
  context?: string,
): Map<string, SyllabusNode> {
  const topics = new Map<string, SyllabusNode>();

  eachSyllabusStatement(introBody, source, context, 4, (statement) => {
    for (const item of statement.items) {
      const key = normalizeAnswer(item.name);
      if (!topics.has(key)) {
        topics.set(
          key,
          makeNode({
            name: item.name,
            kind: "topic",
            sourceRef: item.page ? `p. ${item.page}` : "",
          }),
        );
      }
    }
  });

  return topics;
}

function mergeTopicNodes(
  mapTopics: SyllabusNode[],
  aiTopics: SyllabusNode[],
): SyllabusNode[] {
  const merged = mapTopics.map((topic) => ({ ...topic }));
  const byName = new Map(merged.map((topic) => [normalizeAnswer(topic.name), topic]));

  for (const aiTopic of aiTopics) {
    const key = normalizeAnswer(aiTopic.name);
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing) {
      merged.push({ ...aiTopic, chapter: aiTopic.chapter || aiTopic.name });
      byName.set(key, merged[merged.length - 1]);
      continue;
    }
    const childKeys = new Set(existing.children.map((child) => normalizeAnswer(child.name)));
    for (const child of aiTopic.children) {
      if (!childKeys.has(normalizeAnswer(child.name))) {
        existing.children.push(child);
        childKeys.add(normalizeAnswer(child.name));
      }
    }
  }

  return merged.slice(0, 40);
}

function uncoveredPageWarning(map: DocumentMap) {
  const covered = new Set<number>();
  for (const chapter of map.chapters) {
    for (
      let page = chapter.startPage ?? 0;
      page <= (chapter.endPage ?? 0);
      page++
    ) {
      covered.add(page);
    }
  }
  for (const page of map.references?.pages ?? []) covered.add(page);

  return map.pages
    .map((entry) => entry.page)
    .filter((page) => page > 0 && !covered.has(page));
}

/**
 * Extracts a validated syllabus from a note.
 *
 * When the document map finds real chapters, extraction runs per chapter so
 * the model never sees only the first pages, and the deterministic map topics
 * guarantee that every chapter makes it into the output even if the AI is
 * unavailable. Notes without chapter structure fall back to the legacy
 * chunk-based AI extraction plus the local parser.
 */
export async function extractSyllabus(
  source: string,
  context?: string,
): Promise<SyllabusExtraction> {
  const cleaned = source.trim();
  if (cleaned.length < 40) {
    return {
      nodes: [],
      engine: "local",
      warnings: ["Add a little more text before detecting a syllabus."],
    };
  }

  const map = buildDocumentMap(source);

  // A single chapter is used when it is explicitly numbered (a unit or
  // chapter heading) and carries real content — the classic "one unit,
  // many slides/documents" note. Without this, such notes fall through to
  // the weaker legacy line parser.
  const singleNumberedChapter =
    map.chapters.length === 1 &&
    map.chapters[0].number != null &&
    map.chapters[0].raw.length > 1_500;

  if (map.chapters.length >= 2 || singleNumberedChapter) {
    const warnings: string[] = [];
    if (map.references) {
      warnings.push(
        `${map.references.label} (pp. ${[...new Set(map.references.pages)].join(", ")}) is reference material and was not turned into topics.`,
      );
    }
    const uncovered = uncoveredPageWarning(map);
    if (uncovered.length > 0) {
      warnings.push(
        `Pages ${uncovered.join(", ")} had no detectable chapter structure and were not used for topics.`,
      );
    }
    warnings.push(...map.warnings);

    let aiChapters = 0;
    const nodes: SyllabusNode[] = [];

    // Under a ~5 requests/minute free-tier quota, refining every chapter with
    // its own request would exhaust the account on the first large upload.
    // The document-map local parser already guarantees every chapter gets
    // topics, so AI refinement is a bounded bonus for the first chapters.
    const AI_SYLLABUS_CALL_LIMIT = 2;

    for (const chapter of map.chapters) {
      const mapTopics = mapChapterTopicNodes(chapter, context);
      let merged = mergeTopicNodes(mapTopics, []);

      if (aiEnabled() && aiChapters < AI_SYLLABUS_CALL_LIMIT) {
        const material = compactChapterMaterial(chapter);
        try {
          const first = await requestChunkSyllabus(
            [
              `The material below is "${chapter.label}" (${chapter.startPage ? `p. ${chapter.startPage}` : "?"}-${chapter.endPage ? `p. ${chapter.endPage}` : "?"}) of the document.`,
              material,
            ].join("\n"),
            context,
          );
          const aiChaptersForChapter = validateSyllabus(first, material, context);

          if (aiChaptersForChapter.length > 0) {
            aiChapters += 1;
            // Every topic the model returned for this single-chapter material
            // belongs to this chapter, whatever title it labelled them with.
            const aiTopics = aiChaptersForChapter.flatMap((entry) =>
              entry.kind === "chapter" ? entry.children : [entry],
            );
            merged = mergeTopicNodes(mapTopics, aiTopics);
          }
        } catch {
          warnings.push(
            `AI syllabus extraction failed for ${chapter.label}; used the local parsing of that chapter.`,
          );
        }
      }

      const label = chapter.startPage
        ? `${chapter.label} (pp. ${chapter.startPage}-${chapter.endPage ?? chapter.startPage})`
        : chapter.label;
      nodes.push(
        makeNode({
          name: label,
          kind: "chapter",
          sourceRef: chapter.startPage ? `p. ${chapter.startPage}` : "",
          children: merged,
        }),
      );
    }

    return {
      nodes: dedupeNodes(nodes),
      engine: aiChapters > 0 ? "ai" : "local",
      warnings,
    };
  }

  const chunks = splitSource(cleaned);
  const warnings: string[] = [];

  // The deterministic local result is the BASELINE; AI chapters are merged
  // into it. Without this, a thin AI answer (e.g. only 2 of 5 statement
  // topics) silently discarded the topics the local parser had already
  // found — the deterministic parser guarantees the floor, AI adds on top.
  const local = localSyllabus(cleaned, context);
  const merged: SyllabusNode[] = local.map((chapter) => ({
    ...chapter,
    children: [...chapter.children],
  }));
  let aiChapters = 0;

  // The local parser fills anything the AI misses, so at most the first few
  // chunks ever generate quota spend (the legacy path only runs for documents
  // without real chapter structure).
  for (const chunk of chunks.slice(0, 2)) {
    let nodes: SyllabusNode[] = [];
    try {
      const first = await requestChunkSyllabus(chunk, context);
      nodes = validateSyllabus(first, chunk, context);
    } catch {
      warnings.push("AI syllabus extraction failed for one section; used local parsing.");
    }
    if (nodes.length > 0) aiChapters += 1;
    mergeChapters(merged, nodes);
  }

  const result = dedupeAcrossChapters(merged);

  // When real topics exist, chapters that lost every child to the dedupe
  // (e.g. an AI "Unit-1" shell whose topics duplicated statement topics) are
  // noise; a document with only bare chapter headings keeps them.
  const finalNodes = result.some((chapter) => chapter.children.length > 0)
    ? result.filter((chapter) => chapter.children.length > 0)
    : result;

  if (finalNodes.length === 0) {
    warnings.push(
      "No clear chapters or topics were found. Add headings, numbered sections or bullet points to the note.",
    );
  }

  return { nodes: finalNodes, engine: aiChapters > 0 ? "ai" : "local", warnings };
}

/**
 * Collapses names that appear both as a chapter and as a topic (or in two
 * chapters): the first occurrence wins, so "Introduction to Python" is not
 * stored once as a chapter and again as a topic under "Unit-1". Unique
 * children of a duplicated chapter are folded into the first chapter.
 */
function dedupeAcrossChapters(chapters: SyllabusNode[]): SyllabusNode[] {
  const seen = new Set<string>();
  const result: SyllabusNode[] = [];

  for (const chapter of chapters) {
    const chapterKey = normalizeAnswer(chapter.name);
    const children = dedupeNodes(
      chapter.children.filter((child) => {
        const key = normalizeAnswer(child.name);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    );

    if (chapterKey && !seen.has(chapterKey)) {
      seen.add(chapterKey);
      result.push({ ...chapter, children });
    } else if (children.length > 0 && result.length > 0) {
      // The chapter name repeated an earlier entry — keep its unique topics.
      result[0].children.push(...children);
    }
  }

  return result;
}

export type SyllabusRow = {
  key: string;
  parentKey: string | null;
  name: string;
  kind: SyllabusKind;
  chapter: string;
  sourceRef: string;
  difficulty: number;
  importance: number;
  estimatedMinutes: number;
  position: number;
};

/**
 * Flattens the tree into DB-ready rows. `parentKey` refers to the `key` of the
 * parent row so a server action can create rows top-down and map ids.
 */
export function flattenSyllabus(nodes: SyllabusNode[]): SyllabusRow[] {
  const rows: SyllabusRow[] = [];

  function walk(list: SyllabusNode[], parentKey: string | null, chapter: string) {
    list.forEach((node, index) => {
      const key = `${parentKey ?? "root"}:${index}:${normalizeAnswer(node.name)}`;
      const chapterName = node.kind === "chapter" ? node.name : node.chapter || chapter;

      rows.push({
        key,
        parentKey,
        name: node.name,
        kind: node.kind,
        chapter: chapterName,
        sourceRef: node.sourceRef,
        difficulty: node.difficulty,
        importance: node.importance,
        estimatedMinutes: node.estimatedMinutes,
        position: index,
      });

      if (node.children.length > 0) {
        walk(node.children, key, chapterName);
      }
    });
  }

  walk(nodes, null, "");
  return rows;
}
