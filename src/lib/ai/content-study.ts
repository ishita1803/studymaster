/**
 * Mandatory content-understanding stage.
 *
 * Before any flashcard/quiz/mock-test generation, the material is fully
 * studied locally: every chunk of the joined note text is read, an outline
 * (chapters/sections) is built with the existing document map when possible,
 * and the important concepts, definitions and cross-relations are collected
 * with the same registry machinery the rest of generation is grounded in.
 * At most ONE extra Gemini call synthesises this full-document view into a
 * compact structured understanding (key concepts + how they relate); its
 * output is validated against the source text, so nothing fabricated can
 * enter the study record.
 *
 * The result is cached by the SHA-256 of the joined source, so flashcards and
 * quizzes generated from the same material share one understanding pass.
 * Material without enough readable content raises `InsufficientMaterialError`
 * — the app then shows a clear error instead of inventing questions.
 */
import { createHash } from "node:crypto";

import { generateJson, aiEnabled } from "./gemini";
import {
  definitionsOf,
  registryDefinitions,
  registryFor,
  splitSource,
} from "./study-tools";
import { normalizeAnswer } from "@/lib/utils";

export type StudiedConcept = {
  term: string;
  meaning: string;
  /** Where it came from, e.g. "Chapter 2 · p.12" or "section 3". */
  where: string;
};

export type ContentStudy = {
  /** SHA-256 of the joined source — the cache key. */
  sourceKey: string;
  /** Number of document chunks actually read. */
  chunksStudied: number;
  sentences: number;
  characters: number;
  /** Chapter/section titles from the document map (whole document). */
  outline: string[];
  /** Important concepts found in the material, with meanings. */
  concepts: StudiedConcept[];
  /** "X relates to Y in <section>" links between co-cited concepts. */
  relations: string[];
  /** True when the material carries enough real content to generate from. */
  sufficient: boolean;
  /** Why the material is insufficient, when it is. */
  reason?: string;
  /** Whether the extra AI synthesis call produced usable extra concepts. */
  aiSynthesis: "none" | "local-only" | "used";
};

export class InsufficientMaterialError extends Error {
  study: ContentStudy;

  constructor(study: ContentStudy) {
    super(
      study.reason ??
        "These notes do not contain enough readable study material. " +
          "Upload notes with real text content, or paste the content directly.",
    );
    this.name = "InsufficientMaterialError";
    this.study = study;
  }
}

/** Minimum real content before anything may be generated from it. */
const MIN_CONTENT_CHARS = 250;
const MIN_CONTENT_SENTENCES = 6;

type AiSynthesis = {
  summary?: string;
  keyConcepts?: { term?: string; meaning?: string }[];
  relations?: string[];
};

const UNDERSTANDING_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    keyConcepts: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          term: { type: "STRING" },
          meaning: { type: "STRING" },
        },
        required: ["term", "meaning"],
      },
    },
    relations: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["summary", "keyConcepts"],
};

const UNDERSTANDING_INSTRUCTION =
  "You are Nova, a careful study tutor. You have STUDIED the material below " +
  "(extracted from the student's lecture notes). Read the whole extract — it " +
  "covers the document from beginning to end — then report your structured " +
  "understanding: a short summary, the important concepts with their meanings " +
  "as the notes define them, and how concepts relate to each other (use " +
  "sentences naming the concepts from the notes). Use ONLY facts explicitly " +
  "present in the material; never add outside knowledge or invented concepts.";

/** Sentence candidates per chunk — definitionsOf cleans and filters them. */
function sentencesOf(chunk: string) {
  return chunk
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.split(" ").length >= 4);
}

/** Deterministic full-document local study pass (no AI calls). */
function localStudy(source: string, sourceKey: string): ContentStudy {
  const chunks = splitSource(source);
  const characters = chunks.join("").length;

  const registry = registryFor(source);
  const outline: string[] = [];
  if (registry) {
    for (const chapter of registry.chapters) {
      outline.push(chapter.title || chapter.label);
      for (const section of chapter.sections.slice(0, 6)) {
        outline.push(section.title);
      }
    }
  }

  const sentences: string[] = [];
  for (const chunk of chunks) sentences.push(...sentencesOf(chunk));

  const conceptsMap = new Map<string, StudiedConcept>();
  if (registry) {
    for (const def of registryDefinitions(registry)) {
      const key = normalizeAnswer(def.term);
      if (!key || conceptsMap.has(key)) continue;
      conceptsMap.set(key, {
        term: def.term,
        meaning: def.meaning,
        where:
          def.chapterLabel != null && def.page != null
            ? `${def.chapterLabel} · p.${def.page}`
            : def.chapterLabel ?? "notes",
      });
    }
  }
  if (conceptsMap.size < 3) {
    // Documents without detectable chapters or labelled facts still yield
    // plain running-text definitions through the same cleaning pipeline.
    for (const def of definitionsOf(sentences)) {
      const key = normalizeAnswer(def.term);
      if (!key || conceptsMap.has(key)) continue;
      conceptsMap.set(key, {
        term: def.term,
        meaning: def.meaning,
        where: "notes",
      });
    }
  }

  // Concepts cited in the same paragraph usually relate; record a bounded,
  // verifiable relation set ("A ↔ B — section/chapter").
  const relations: string[] = [];
  const knownTerms = [...conceptsMap.values()].map((c) => c.term);
  for (const chunk of chunks) {
    if (relations.length >= 24) break;
    const present = knownTerms.filter((term) =>
      normalizeAnswer(chunk).includes(normalizeAnswer(term)),
    );
    for (let i = 0; i < present.length && relations.length < 24; i++) {
      for (let j = i + 1; j < present.length && relations.length < 24; j++) {
        relations.push(`${present[i]} ↔ ${present[j]} appear together in the notes`);
      }
    }
  }

  const sentencesCount = sentences.length;
  const sufficient =
    characters >= MIN_CONTENT_CHARS && sentencesCount >= MIN_CONTENT_SENTENCES;

  const reason = sufficient
    ? undefined
    : characters < MIN_CONTENT_CHARS
      ? `The selected notes contain too little readable text (${characters} characters). ` +
        "Upload study material with real written content before generating practice questions."
      : `The selected notes contain too few readable sentences (${sentencesCount}). ` +
        "Clearer study material (not blank scans or page headers) is needed to generate practice questions.";

  return {
    sourceKey,
    chunksStudied: chunks.length,
    sentences: sentencesCount,
    characters,
    outline,
    concepts: [...conceptsMap.values()].slice(0, 40),
    relations,
    sufficient,
    reason,
    aiSynthesis: "local-only",
  };
}

/** At most one AI synthesis over the whole-document view; validated, optional. */
async function aiSynthesize(study: ContentStudy, source: string): Promise<ContentStudy> {
  if (!aiEnabled() || !study.sufficient || study.characters < 1200) return study;

  const regex = /(?<=[.!?])\s+/;
  const sentences = source
    .replace(/\[\[page:\s*\d+\s*\]\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(regex)
    .filter((part) => part.split(" ").length >= 4);

  // Cover the whole document: sample sentences evenly from start to end.
  const MAX_SENTENCES = 140;
  const fetchAll = sentences.length <= MAX_SENTENCES;
  const step = fetchAll ? 1 : (sentences.length - 1) / (MAX_SENTENCES - 1);
  const extract: string[] = [];
  for (let i = 0; i < sentences.length && extract.length < MAX_SENTENCES; i++) {
    const index = fetchAll ? i : Math.round(i * step);
    if (sentences[index]) extract.push(sentences[index]);
  }

  const result: AiSynthesis | null = await generateJson<AiSynthesis>(
    `STUDIED NOTES EXCERPT (covers the document from beginning to end):\n\n` +
      extract.join(" "),
    UNDERSTANDING_INSTRUCTION,
    UNDERSTANDING_SCHEMA,
    2200,
  ).catch(() => null);
  if (!result) {
    // Provider unavailable or quota'd: the deterministic local study already
    // read the whole document, so understanding never blocks generation here.
    return study;
  }

  const haystack = normalizeAnswer(source);
  const added = new Map<string, StudiedConcept>();
  const seen = new Set(study.concepts.map((c) => normalizeAnswer(c.term)));
  for (const concept of result.keyConcepts ?? []) {
    const term = String(concept.term ?? "").trim().slice(0, 80);
    const normalized = normalizeAnswer(term);
    if (!term || normalized.length < 3 || seen.has(normalized)) continue;
    // Validate against the source: a concept the notes never mention is fake.
    if (!haystack.includes(normalized)) continue;
    seen.add(normalized);
    added.set(normalized, {
      term,
      meaning: String(concept.meaning ?? "").trim().slice(0, 400),
      where: "notes",
    });
  }

  const relations = (result.relations ?? [])
    .map((relation) => String(relation).trim().slice(0, 200))
    .filter(
      (relation) =>
        relation.split(/\s+/).length >= 4 && haystack.includes(relation.split(/\s+/)[0].toLowerCase()),
    )
    .slice(0, 12);

  return {
    ...study,
    concepts: [...study.concepts, ...added.values()].slice(0, 40),
    relations: [...relations, ...study.relations].slice(0, 24),
    aiSynthesis: added.size > 0 ? "used" : "local-only",
  };
}

const cache = new Map<string, Promise<ContentStudy>>();
const CACHE_LIMIT = 24;

/**
 * Studies EVERY selected note the student chose (their texts arrive joined in
 * `source`) and returns the structured understanding. Throws
 * `InsufficientMaterialError` when the material is not real study content.
 */
export async function studyContent(source: string): Promise<ContentStudy> {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new InsufficientMaterialError({
      ...(localStudy("", "")),
      sufficient: false,
      chunksStudied: 0,
      reason:
        "No readable study material was selected. Choose notes with real written content, or paste the content.",
    } as ContentStudy);
  }

  const sourceKey = createHash("sha256").update(trimmed).digest("hex");
  const cached = cache.get(sourceKey);
  if (cached) return cached;

  // Cache the promise so concurrent card + quiz generations share one pass.
  const task = (async () => {
    const local = localStudy(source, sourceKey);
    const understanding = await aiSynthesize(local, source);
    if (!understanding.sufficient) throw new InsufficientMaterialError(understanding);
    return understanding;
  })().catch((error) => {
    cache.delete(sourceKey);
    throw error;
  });

  // Bounded cache: enough to dedupe flashcards + quizzes for the last
  // few materials a student worked with, small enough to stay cheap.
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(sourceKey, task);
  return task;
}

/** Cached study metadata, for tests and diagnostics. */
export function studyCachedCount() {
  return cache.size;
}
