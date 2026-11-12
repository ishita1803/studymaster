/**
 * Full-document coverage map.
 *
 * `extract.ts` stores page markers ([[page:N]]) in the note content, so every
 * consumer can locate where each line came from. This module turns that text
 * into a deterministic structure the rest of the app can rely on:
 *
 *   pages → chapters → sections → bullets / labelled blocks
 *
 * It is used by syllabus extraction, quiz generation and flashcard generation
 * so nothing drops later chapters, and so questions/cards can cite real pages.
 */

export const PAGE_MARKER_RE = /\[\[page:\s*(\d+)\s*\]\]/g;
const PAGE_MARKER_LINE_RE = /^\s*\[\[page:\s*\d+\s*\]\]\s*$/;

export type MapBlock = { text: string; page: number | null };

export type MapSection = {
  /** Numbered section id such as "6.1", or a lettered "A." label. */
  number: string | null;
  title: string;
  page: number | null;
  /** Bullet lines that belong to this section. */
  bullets: MapBlock[];
  /** Paragraph/body lines (page markers stripped) that follow the heading. */
  body: MapBlock[];
};

export type MapChapter = {
  /** 1-based order among the study chapters. */
  index: number;
  /** Chapter number from the heading, when the document numbers chapters. */
  number: number | null;
  title: string;
  /** Display label, e.g. "Chapter 6: Backend Engineering ...". */
  label: string;
  startPage: number | null;
  endPage: number | null;
  /** Full chapter text, page markers preserved. */
  raw: string;
  sections: MapSection[];
  /** Bullets that appear before the first numbered section. */
  introBullets: MapBlock[];
  /** Body/paragraph lines that appear before the first numbered section. */
  introBody: MapBlock[];
};

export type DocumentMap = {
  hasPageMarkers: boolean;
  pageCount: number;
  pages: { page: number; text: string }[];
  chapters: MapChapter[];
  /** Reference/bibliography sections are excluded from study chapters. */
  references: { label: string; pages: number[] } | null;
  warnings: string[];
};

const CHAPTER_RE = [
  /^(?:-{2,}\s*)?chapter\s*[-–—:.]?\s*(\d{1,2})\s*(?:[:.\-–—]\s*|\s+)(.{2,120})$/i,
  /^(?:-{2,}\s*)?chapter\s*[-–—:.]?\s*(\d{1,2})\s*[-–—:.]?\s*$/i,
];

const GENERIC_CHAPTER_RE =
  /^(?:-{2,}\s*)?(?:unit|part|module|lesson)\s*[-–—:.]?\s*(\d{1,2})\s*(?:[:.\-–—]\s*|\s+)(.{2,120})$/i;

/** Markdown notes: short markdown headings (#, ##, ###) open a chapter. */
const MARKDOWN_HEADING_RE = /^(#{1,3})\s+(.{2,120})$/;

/** A numbered section such as "6.1 Deterministic Parsing Engine". */
const SECTION_RE = /^(\d{1,2}\.\d{1,2})\s*[-–—:.]?\s+(.{2,120})$/;
/** Lettered sub-block "A. Robust Fallback Model Chain". */
const LETTERED_RE = /^([A-Z])[.)]\s+(.{2,90})$/;
const NUMBERED_STEP_RE = /^\d{1,2}[.)]\s+/;

const BULLET_RE = /^\s*(?:•|▪|◦|·|\*)\s+(.+)$/;
const CIRCLED_BULLET_RE = /^\s+o\s+(.+)$/;

const REFERENCES_RE =
  /^(?:references?|refrences?|refernces?|references?\s+and\s+bibliograph\w*|bibliograph\w*|works?\s+cited|literature\s+cited|citation\s+list)\b/i;

const ALL_CAPS_EXCEPTIONS = new Set(["api","pdf","json","llm","uml","rls","sde","ats","srs","sql","http","https","css","html","ui","ux","ai","ml","js","ts","saas","pwa","devops","qa","crud","nlp","seo","kv","gd","wcag"]);

/** Words whose marketing casing should survive title-casing. */
const PROPER_NOUNS = new Map([
  ["devops", "DevOps"],
  ["github", "GitHub"],
  ["javascript", "JavaScript"],
  ["typescript", "TypeScript"],
  ["postgresql", "PostgreSQL"],
  ["chatgpt", "ChatGPT"],
  ["openai", "OpenAI"],
]);

const SMALL_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or",
  "the", "to", "vs", "with", "via",
]);

export function collapseSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/** "BACKEND ENGINEERING AND CORE ALGORITHMIC" → "Backend Engineering and Core Algorithmic" */
export function titleCase(value: string) {
  const words = collapseSpaces(String(value ?? ""))
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/[.:\-–—]+$/, "")
    .split(/\s+/)
    .filter(Boolean);

  return words
    .map((word, index) => {
      // Keep tokens with digits ($0/Month, 2-Week) and odd unicode verbatim.
      if (/\d/.test(word)) return word;
      const lower = word.toLowerCase();
      if (SMALL_WORDS.has(lower) && index > 0) return lower;
      const properNoun = PROPER_NOUNS.get(lower);
      if (properNoun) return properNoun;
      // Preserve mixed-case tokens: "Placement-Cell", "$0/Month", "LLM-second".
      // Fully uppercase words (headings) go through the normal casing path.
      if (word !== word.toUpperCase() && /[A-Z]/.test(word.slice(1))) return word;
      const clusters = word.match(/[A-Za-z]+/g) ?? [];
      const isAcronymWord = clusters.some((cluster) =>
        [...ALL_CAPS_EXCEPTIONS].some(
          (key) =>
            cluster.length <= 6 &&
            (cluster.toLowerCase() === key ||
              cluster.toLowerCase().startsWith(key)),
        ),
      );
      if (isAcronymWord) {
        return word
          .replace(/[A-Za-z]+/g, (cluster) =>
            ALL_CAPS_EXCEPTIONS.has(cluster.toLowerCase()) ||
            ALL_CAPS_EXCEPTIONS.has(cluster.toLowerCase().slice(0, 4))
              ? cluster.toUpperCase()
              : cluster.toLowerCase(),
          );
      }
      // Capitalize the first letter — not position 0, which may be "(LWW)".
      // Parenthesised all-caps tokens keep their casing: "(LWW)".
      if (/^\([A-Z0-9/&-]+\)$/.test(word)) return word;
      const firstLetter = word.search(/[a-zA-Z]/);
      if (firstLetter < 0) return word;
      return (
        word.slice(0, firstLetter) +
        word.charAt(firstLetter).toUpperCase() +
        word.slice(firstLetter + 1).toLowerCase()
      );
    })
    .join(" ");
}

/** Layout debris inside titles: equations, JSON and quotes. */
const TITLE_JUNK_RE = /\s*(?:[=≠≈∪∩∖≤≥⟨⟩∑√]|\{|\[|[“”"]|𝑅|𝑆|𝑈|𝑀|𝑃|𝐻|Paint)/i;

/** Column/table-header fragments that get glued onto wrapped headings. */
const DEBRIS_RE =
  /\s+(?:endpoint method|metric target|behavior status|cost dimension|test input|observed|feature\/|infrastructure pillar|mathematical formulation)\b.*$/i;

/** Trailing single words that almost always begin glued column fragments. */
const TAIL_FRAGMENTS = new Set([
  "solution", "resumeai", "monthly", "first", "observed", "good", "provider",
  "boundaries", "boundary", "dimension", "standard", "mechanics",
  "formulation", "behavior", "persist", "status", "paint", "approach",
  "traditional", "commercial", "feature", "features", "core",
  "qualification", "projected",
]);

const CONNECTOR_WORDS = new Set([
  "and", "or", "of", "the", "in", "to", "for", "with", "a", "an", "on", "vs",
  "vs.", "from", "at", "by", "via",
]);

function trimTitleJunk(title: string, max = 90) {
  let clean = collapseSpaces(title).split(TITLE_JUNK_RE)[0].trim();
  clean = clean.split(DEBRIS_RE)[0].trim();
  // Cap glued titles, then drop dangling connectors and column fragments
  // left behind by single-column PDF reading order.
  let capped = clean.split(/\s+/).filter(Boolean).slice(0, 8);
  while (
    capped.length > 3 &&
    (CONNECTOR_WORDS.has(capped[capped.length - 1].toLowerCase()) ||
      TAIL_FRAGMENTS.has(capped[capped.length - 1].toLowerCase()) ||
      /[\/)\]"“”.,;:]$/.test(capped[capped.length - 1]) ||
      capped[capped.length - 1].toLowerCase() ===
        capped[capped.length - 2].toLowerCase())
  ) {
    capped = capped.slice(0, -1);
  }
  clean = capped.join(" ");
  clean = clean.replace(/[–—:.\s]+$/, "").trim();
  if (clean.length > max) clean = clean.slice(0, max).trim();
  return collapseSpaces(clean);
}

function sectionTitle(raw: string) {
  return trimTitleJunk(stripSectionNumber(raw), 78);
}

/** Trim only, no word cap: applied to chapter title lines. */
function chapterTitle(raw: string) {
  let clean = collapseSpaces(raw).split(TITLE_JUNK_RE)[0].trim();
  clean = clean.replace(/[–—:.\s]+$/, "").trim();
  return collapseSpaces(clean);
}

function looksLikeTitleLine(line: string) {
  const text = line.trim();
  if (!text || text.length > 90) return false;
  if (PAGE_MARKER_LINE_RE.test(text)) return false;
  if (BULLET_RE.test(line) || CIRCLED_BULLET_RE.test(line)) return false;
  if (SECTION_RE.test(text) || LETTERED_RE.test(text) || NUMBERED_STEP_RE.test(text)) {
    return false;
  }
  if (CHAPTER_RE.some((re) => re.test(text))) return false;
  if (text.includes("{") || text.includes("}")) return false;

  const letters = text.replace(/[^A-Za-z]/g, "");
  if (!letters) return false;
  const upperRatio =
    letters.split("").filter((ch) => ch === ch.toUpperCase()).length / letters.length;
  return upperRatio >= 0.75;
}

/**
 * A continuation of a wrapped heading ("...Short-Token" / "Disambiguation").
 * The next line must be short, start upper-case, have no digits, math/JSON
 * characters or sentence punctuation — otherwise it is a new paragraph.
 */
function looksLikeHeadingContinuation(line: string) {
  const text = line.trim();
  if (!text || text.length > 80) return false;
  if (!/^[A-Z0-9"/]/.test(text)) return false;
  // Column/table-header vocabulary never starts a wrapped heading tail.
  const firstWord = text.split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, "");
  if (TAIL_FRAGMENTS.has(firstWord) || CONNECTOR_WORDS.has(firstWord)) return false;
  if (/\d/.test(text)) return false;
  if (/[.!?;:,]$/.test(text)) return false;
  if (/[{}[\]⟨⟩=≠≈≤≥∪∩∖∑√𝑅𝑆𝑈𝑀𝑃𝐻]/.test(text)) return false;
  // Quotes, parentheses and slashes are signals of glued table/figure text.
  if (/["“”(/)]/.test(text)) return false;
  if (PAGE_MARKER_LINE_RE.test(text)) return false;
  if (BULLET_RE.test(line) || CIRCLED_BULLET_RE.test(line)) return false;
  if (SECTION_RE.test(text) || LETTERED_RE.test(text) || NUMBERED_STEP_RE.test(text)) {
    return false;
  }
  if (CHAPTER_RE.some((re) => re.test(text))) return false;
  const words = text.split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 9;
}

export function stripSectionNumber(text: string) {
  return collapseSpaces(text.replace(/(?:^\d{1,2}\.\d{1,2}\s*[-–—:.]?\s*)|(?:^[A-Z][.)]\s+)/, ""));
}

type MapPage = { page: number | null; lines: string[] };

function buildPages(source: string): MapPage[] {
  const markerPositions: { index: number; page: number }[] = [];
  for (const match of source.matchAll(PAGE_MARKER_RE)) {
    markerPositions.push({ index: match.index ?? 0, page: Number(match[1]) });
  }

  if (markerPositions.length === 0) {
    return [{ page: null, lines: source.split("\n") }];
  }

  const pages: MapPage[] = [];
  for (let i = 0; i < markerPositions.length; i++) {
    const start = markerPositions[i];
    const end =
      i + 1 < markerPositions.length
        ? markerPositions[i + 1].index
        : source.length;

    const body = source.slice(start.index, end);
    const lineBody = body.replace(PAGE_MARKER_RE, "").replace(/^\n+/, "");
    pages.push({ page: start.page, lines: lineBody.split("\n") });
  }

  // Text before the first marker is treated as an unpaged preamble.
  const before = source.slice(0, markerPositions[0].index).trim();
  if (before) pages.unshift({ page: null, lines: before.split("\n") });

  return pages;
}

function isHeadingLike(text: string) {
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (!letters) return false;
  const upperRatio =
    letters.split("").filter((ch) => ch === ch.toUpperCase()).length / letters.length;
  // Real chapter headings are labelled in capitals; prose sentences like
  // "Chapter 2 presents a comprehensive literature survey..." are not.
  if (upperRatio >= 0.6) return true;
  // Title-case headings without sentence punctuation also qualify.
  return (
    /^[A-Z][A-Za-z0-9 ()\/'"“”,.&+:–—-]{1,80}$/.test(text.trim()) &&
    !/[.!?]$/.test(text.trim())
  );
}

function cleanTitleCandidate(value: string, chapterNumber: number | null) {
  let title = collapseSpaces(value)
    .replace(/^[-–—:.\s]+/, "")
    .replace(/[.:\-–—]+$/, "")
    .trim();
  if (!chapterNumber) return title;
  title = title.replace(
    new RegExp(
      `^(?:chapter|chp|unit|part|module|lesson)?\\s*[-–—:.]?\\s*${chapterNumber}\\b\\s*[-–—:.]?\\s*`,
      "i",
    ),
    "",
  );
  return collapseSpaces(title);
}

type Draft = {
  number: number | null;
  title: string;
  blocks: MapBlock[];
  startPage: number | null;
};

/**
 * Slide decks and lecture notes repeat their page header ("Unit-1:
 * Introduction to Python") on every page. Repeating a heading with the same
 * chapter number and the same (or a subset) title must continue the running
 * chapter instead of manufacturing page-range "chapters" like
 * "Chapter 1 (pp. 2-13)", "Chapter 1 (pp. 13-24)".
 */
function continuesRunningChapter(
  last: Draft,
  number: number | null,
  title: string,
): boolean {
  if (last.number == null || number == null || last.number !== number) {
    return false;
  }
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const a = normalize(last.title);
  const b = normalize(title);
  if (!a || !b) return true;
  if (a === b) return true;
  // "Variables And Operators in Python" vs "Python Variables and Operators"
  // are treated as the same running header when their substantive words
  // overlap strongly; short header variants after OCR noise stay merged.
  const wa = new Set(a.split(" ").filter((word) => word.length > 3));
  const wb = new Set(b.split(" ").filter((word) => word.length > 3));
  if (wa.size === 0 || wb.size === 0) return true;
  let shared = 0;
  for (const word of wa) if (wb.has(word)) shared++;
  return shared / Math.min(wa.size, wb.size) >= 0.6;
}

/** Numbered book sections ("6.1 ...") with the bullet lines under each. */
export function sectionsFromBlocks(
  blocks: MapBlock[],
  chapterNumber: number | null,
): { sections: MapSection[]; introBullets: MapBlock[]; introBody: MapBlock[] } {
  const sections: MapSection[] = [];
  const introBullets: MapBlock[] = [];
  const introBody: MapBlock[] = [];
  let section: MapSection | null = null;
  // Only the line immediately after a heading may extend the title; fragments
  // from far-below table rows must never reach it.
  let lastWasTitle = false;

  const save = () => {
    if (!section) return;
    const title = titleCase(section.title);
    if (title.length < 3) {
      section = null;
      lastWasTitle = false;
      return;
    }
    sections.push({ ...section, title });
    section = null;
    lastWasTitle = false;
  };

  const bulletBody = (text: string) => {
    const bullet = BULLET_RE.exec(text);
    if (bullet) return bullet[1];
    const circled = CIRCLED_BULLET_RE.exec(text);
    return circled ? circled[1] : null;
  };

  for (const block of blocks) {
    const raw = block.text.trim();
    const wasTitle = lastWasTitle;
    lastWasTitle = false;
    if (!raw) continue;
    if (PAGE_MARKER_LINE_RE.test(raw)) continue;

    const numbered = SECTION_RE.exec(raw);
    if (numbered && (!chapterNumber || numbered[1].startsWith(`${chapterNumber}.`))) {
      save();
      section = {
        number: numbered[1],
        title: sectionTitle(raw),
        page: block.page,
        bullets: [],
        body: [],
      };
      lastWasTitle = true;
      continue;
    }

    const bullet = bulletBody(block.text);
    if (bullet) {
      const blockRef = { text: block.text, page: block.page };
      if (section) {
        section.bullets.push({ text: bullet, page: block.page });
        // Keep the full bullet line in the body too: labelled bullet facts
        // ("Automated Unit Testing: Evaluates ...") become definition sources.
        section.body.push(blockRef);
      } else {
        introBullets.push({ text: bullet, page: block.page });
        introBody.push(blockRef);
      }
      continue;
    }

    // A wrapped heading line ("...Core Algorithmic" / "FRAMEWORK") continues
    // the previous section title only when it is heading-like IN THE SAME
    // ALL-CAPS style as the document's real headings. Mixed-case lines such as
    // "Qualification", "ChatGPT", "Largest" or "In-browser processing via
    // pdfjs-dist" are glued table/figure fragments and must be ignored.
    if (
      wasTitle &&
      section &&
      section.title.length < 60 &&
      looksLikeHeadingContinuation(raw)
    ) {
      // ALL-CAPS wrap ("...Core Algorithmic" / "FRAMEWORK"), or a single
      // Title-Case word continuing a hyphenated compound ("...Short-Token" /
      // "Disambiguation" — headings that wrap in this document).
      const singleCompoundTail =
        /^[A-Z][a-z]+$/.test(raw) && /[A-Za-z]-[A-Za-z]/.test(section.title);
      if (looksLikeTitleLine(raw) || singleCompoundTail) {
        // Re-apply the debris trim so glued table fragments cannot survive
        // inside the title.
        section.title = trimTitleJunk(`${section.title} ${raw}`, 78);
        lastWasTitle = true;
        continue;
      }
    }

    const lettered = LETTERED_RE.exec(raw);
    if (lettered) {
      save();
      section = {
        number: `${lettered[1]}.`,
        title: collapseSpaces(lettered[2]),
        page: block.page,
        bullets: [],
        body: [],
      };
      lastWasTitle = true;
      continue;
    }

    if (section) section.body.push({ text: block.text, page: block.page });
    else introBody.push({ text: block.text, page: block.page });
  }
  save();
  return { sections, introBullets, introBody };
}

/**
 * A bullet lead-in concept: "Keyword and Competency Matching: ..." →
 * "Keyword And Competency Matching". Prose fragments, requirement ids and code
 * identifiers are rejected so generated material stays meaningful.
 */
export function bulletLead(body: string): string | null {
  let clean = collapseSpaces(body.replace(/`/g, "")).split(TITLE_JUNK_RE)[0];
  clean = clean.split(DEBRIS_RE)[0].trim();
  if (!clean || /https?:/i.test(clean) || /[{}]/.test(clean)) return null;

  const colon = clean.indexOf(":");
  const head = collapseSpaces(
    colon > 2 && colon <= 70 ? clean.slice(0, colon) : clean,
  );
  const candidate = head.replace(/[.;:,]+$/, "").trim();
  if (candidate.length < 3 || candidate.length > 90) return null;
  if (!/[A-Za-z]/.test(candidate)) return null;
  if (/^[a-z]/.test(candidate)) return null;
  if (/_/.test(candidate)) return null;
  // Requirement ids ("FR-01", "NFR-3") identify rows, not concepts.
  if (/^[A-Z]{1,4}\s?-\s?\d+/.test(candidate)) return null;
  const words = candidate.split(/\s+/).filter(Boolean);
  if (words.length > 12) return null;
  if (/^[-–—0-9[({!\]]/.test(candidate)) return null;
  if (
    words.length > 1 &&
    CONNECTOR_WORDS.has(words[words.length - 1].toLowerCase())
  ) {
    return null;
  }
  return titleCase(candidate);
}

/**
 * Splits a paged/unpaged document into study chapters.
 * Reference/bibliography headings close the study material.
 */
export function buildDocumentMap(source: string): DocumentMap {
  const pages = buildPages(source);
  const hasPageMarkers = pages.some((entry) => entry.page != null);

  const drafts: Draft[] = [];
  let current: Draft | null = null;
  let pendingTitle: string[] | null = null;
  let references: { label: string; pages: number[] } | null = null;
  /** Lines before the first chapter heading: the cover/official-syllabus
   *  preamble. Cut-off chapters lose their intro page without this. */
  let preamble: MapBlock[] = [];

  for (const entry of pages) {
    if (references) {
      if (entry.page != null) references.pages.push(entry.page);
      continue;
    }

    for (const line of entry.lines) {
      const trimmed = line.trim();

      if (
        !references &&
        trimmed.length <= 90 &&
        REFERENCES_RE.test(trimmed) &&
        !/\d{4}/.test(trimmed) &&
        !/[;.]$/.test(trimmed) &&
        !trimmed.includes("(")
      ) {
        references = { label: collapseSpaces(trimmed), pages: entry.page != null ? [entry.page] : [] };
        current = null;
        pendingTitle = null;
        continue;
      }
      if (references) continue;

      let matched: Draft | null = null;
      for (const re of CHAPTER_RE) {
        const hit = re.exec(trimmed);
        if (!hit) continue;
        const number = Number(hit[1]);
        const inlineTitle = cleanTitleCandidate(hit[2] ?? "", number);
        // Prose such as "Chapter 2 presents a literature survey…" must not
        // open a chapter: only heading-like inline titles are accepted.
        if (inlineTitle && !isHeadingLike(inlineTitle)) break;
        matched = { number, title: inlineTitle, blocks: [], startPage: entry.page };
        pendingTitle = inlineTitle ? null : [];
        break;
      }
      if (!matched) {
        const generic = GENERIC_CHAPTER_RE.exec(trimmed);
        const markdown = MARKDOWN_HEADING_RE.exec(trimmed);
        if (generic) {
          const number = Number(generic[1]);
          const inlineTitle = cleanTitleCandidate(generic[2], number);
          if (!inlineTitle || isHeadingLike(inlineTitle)) {
            matched = {
              number,
              title: inlineTitle,
              blocks: [],
              startPage: entry.page,
            };
            pendingTitle = inlineTitle ? null : [];
          }
        } else if (markdown && markdown[1].length <= 3) {
          const inlineTitle = cleanTitleCandidate(markdown[2], null);
          if (isHeadingLike(inlineTitle) || inlineTitle.length <= 60) {
            matched = {
              number: null,
              title: inlineTitle,
              blocks: [],
              startPage: entry.page,
            };
            pendingTitle = null;
          }
        }
      }

      if (matched) {
        // A repeated page header must continue the running chapter, not
        // manufacture another page-range chapter of the same number.
        const last = drafts[drafts.length - 1];
        if (
          last &&
          matched.number != null &&
          continuesRunningChapter(last, matched.number, matched.title ?? "")
        ) {
          current = last;
          pendingTitle = null;
          continue;
        }
        // The first chapter inherits the preamble so a cover or
        // official-syllabus page is never silently dropped.
        if (drafts.length === 0 && preamble.length > 0) {
          matched.blocks = [...preamble, ...matched.blocks];
          const preamblePage = preamble.find(
            (block) => block.page != null,
          )?.page;
          if (preamblePage != null && (matched.startPage == null || preamblePage < matched.startPage)) {
            matched.startPage = preamblePage;
          }
          preamble = [];
        }
        current = matched;
        drafts.push(matched);
        continue;
      }

      if (pendingTitle) {
        if (looksLikeTitleLine(line) && pendingTitle.length < 3) {
          pendingTitle.push(trimmed);
          continue;
        }
        if (current) current.title = collapseSpaces(pendingTitle.join(" "));
        current?.blocks.push({ text: line, page: entry.page });
        pendingTitle = null;
        continue;
      }

      if (current) current.blocks.push({ text: line, page: entry.page });
      else preamble.push({ text: line, page: entry.page });
    }
  }

  if (pendingTitle && current) current.title = collapseSpaces(pendingTitle.join(" "));

  const chapters: MapChapter[] = [];
  drafts.forEach((draft, draftIndex) => {
    const contentBlocks = draft.blocks.filter(
      (block) => block.text.trim().length > 0,
    );
    // A chapter's extracted tail often includes just the page footer number
    // ("42") of a page that only hosts the next (excluded) section — drop it
    // so page ranges stay accurate.
    while (
      contentBlocks.length > 0 &&
      /^\d{1,4}$/.test(contentBlocks[contentBlocks.length - 1].text.trim())
    ) {
      contentBlocks.pop();
    }
    const raw = contentBlocks
      .map((block) =>
        block.page != null ? `[[page:${block.page}]]\n${block.text}` : block.text,
      )
      .join("\n");
    if (!collapseSpaces(raw)) return;

    // A chapter's last page is often shared with the next chapter's heading
    // (only the page footer sits above it). Only credit that page when real
    // content of this chapter is on it, so page ranges stay accurate.
    const nextStart = drafts[draftIndex + 1]?.startPage ?? null;
    let endPage =
      contentBlocks.reduce(
        (last, block) => (block.page != null ? Math.max(last, block.page) : last),
        draft.startPage ?? 0,
      ) || null;
    if (
      nextStart != null &&
      endPage != null &&
      endPage >= nextStart &&
      contentBlocks
        .filter((block) => block.page === nextStart)
        .every((block) => /^\d{1,4}$/.test(block.text.trim()))
    ) {
      endPage = Math.max(draft.startPage ?? 0, nextStart - 1) || null;
    }

    const title = chapterTitle(
      draft.title || `Chapter ${draft.number ?? draftIndex + 1}`,
    );
    const displayTitle = titleCase(title) || title;
    const parsed = sectionsFromBlocks(contentBlocks, draft.number);
    chapters.push({
      index: chapters.length + 1,
      number: draft.number,
      title: displayTitle,
      label: draft.number ? `Chapter ${draft.number}: ${displayTitle}` : displayTitle,
      startPage: draft.startPage,
      endPage: endPage != null && draft.startPage != null
        ? Math.max(endPage, draft.startPage)
        : endPage,
      raw,
      sections: parsed.sections,
      introBullets: parsed.introBullets,
      introBody: parsed.introBody,
    });
  });

  const warnings: string[] = [];
  const thin = chapters.filter((chapter) => chapter.sections.length === 0);
  if (thin.length > 0) {
    warnings.push(
      `${thin.length} chapter${thin.length === 1 ? "" : "s"} had no clear section headings; their topics come from headings and bullets.`,
    );
  }

  return {
    hasPageMarkers,
    pageCount: pages.filter((entry) => entry.page != null).length,
    pages: pages
      .filter((entry) => entry.page != null)
      .map((entry) => ({ page: entry.page as number, text: entry.lines.join("\n") })),
    chapters,
    references,
    warnings,
  };
}

