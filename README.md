# StudyMaster

A complete, responsive study planner built with Next.js 15. StudyMaster turns a syllabus into a realistic day-by-day roadmap, keeps revision spaced, tests you gently, and nudges you with Nova, a friendly star-blob mascot, instead of guilt.

> **Demo login:** `demo@studymaster.app` / `demo1234`
> The seed includes a populated Biology/Chemistry/Maths/History syllabus, a generated roadmap, two weeks of focus history, quizzes with attempts, 74 flashcard reviews, notes, AI history and 10 badges.

---

## What is inside

| Area | What it does |
| --- | --- |
| **Dashboard** | A **Pick up where you left off** card (saved focus timer, flashcard position or quiz answers, then your next plan block), today's plan with real start times, exam readiness ring, focus rhythm, upcoming exams, weak-topic radar, recent quizzes and badges. |
| **Pomodoro focus timer** | Focus/break cycles, subject + topic tagging, pause/resume, auto-logging, XP and streak updates. An interrupted timer is restored (paused) next time. |
| **Adaptive roadmap** | An explainable weighted scheduler (exam urgency 30%, topic difficulty 18%, subject difficulty 10%, topic importance 9%, exam importance 5%, syllabus incompleteness 10%, preparation level 8%, recent quiz accuracy 6%, remaining effort 4%) fills every day between today and your exams with study, spaced revision or a practice quiz. Every block shows why it was chosen (for example “Exam in 7 days · Very difficult · 65% syllabus incomplete”). Add any number of upcoming tests per subject (unit test, mock, midterm, final) with their own difficulty, preparation level and available material; Nova reserves revision days before each one. New material is split into short 20–45 minute blocks with local start times, subjects rotate, each active subject keeps a minimum daily share so a later difficult exam is not starved, and missed work is re-planned automatically without losing completed blocks. |
| **Quizzes & mock tests** | AI-generated or manual multiple-choice, true/false and short-answer quizzes; optional timer; auto-marking; per-question explanations, topic labels, question format and source references; score history; topic-wise results, weak topics and next-study recommendations. Choose Easy/Medium/Hard, 5/10/15/20 questions, specific chapters/topics, and eight question styles (conceptual, definition, application, scenario, comparison, problem-solving, formula, factual). Filter the list and start a quiz scoped to one subject. Unfinished answers are saved in the browser so a quiz can be resumed. |
| **Spaced-repetition flashcards** | SM-2-inspired scheduler with three honest levels (Need revision / Getting there / Known), keyboard shortcuts (Space flips, arrows move, 1–3 rate), due queue, memory-health stats and session resume. Cards carry a format (definition, explanation, comparison, application, process, formula), topic label, difficulty and source reference. Flip, previous/next, progress, shuffle, Known / Need Revision, review-difficult-only, restart deck, and inline formula rendering. Filter by subject and study only that subject's due cards. |
| **AI study assistant** | Hint-first Gemini chat that knows your subjects, exams, plan, weak topics and due cards. Streams replies and falls back to a deterministic local tutor in demo mode. |
| **Weak-topic detector** | Flags topics below 60% accuracy after at least three answers, then boosts them in the next plan and links straight to practice. |
| **Progress analytics** | 14-day focus chart, subject readiness, mastery mix, quiz trajectory, consistency and plain-language insights. |
| **Notes → shared syllabus → study material** | Paste text **or upload a PDF, DOCX, TXT, MD, CSV file, or a photo/scan of handwritten notes** (PNG, JPG, WEBP; up to 20 MB). Scanned or handwritten pages are transcribed with Gemini vision when a key is set, otherwise with local Tesseract OCR. Every note can then be turned into an **editable detected syllabus** (chapters → topics → subtopics, plus concepts, definitions, formulas, processes and problem-solving sections with page/line references). Review, rename, add, remove, reorder and mark topics complete, then approve the syllabus before it enters the roadmap. The same approved syllabus powers the roadmap, flashcards and quizzes. |
| **Daily goals & reminders** | Per-day minute target, completion detection, dashboard reminder card and streak tracking. |
| **Revision scheduler** | 1 → 3 → interval × ease progression, hard cards return tomorrow, shaky topics capped at three days. |
| **Gamification** | XP for focus, plan blocks, quizzes, perfect scores, reviews and daily goals; levels, 12 badges and streaks. |

---

## Stack

- **Next.js 15** (App Router, Server Components, Server Actions) + **TypeScript**
- **Tailwind CSS v4** with a custom neon/glass design system, canvas particles and a hand-built SVG mascot
- **Prisma 6 + SQLite** locally (string statuses instead of enums, so moving to Postgres is a one-line provider change)
- **Auth.js v5** credentials provider, bcrypt hashes, JWT sessions
- **Google Gemini** via `@google/genai` (`gemini-3.6-flash`, with automatic fallback to `gemini-3.5-flash`) and a deterministic demo-mode fallback
- **Vitest** for scheduler, syllabus extraction, SRS, topic feedback and grading tests
- No chart library — charts are small custom SVG/CSS components

---

## Getting started

```bash
# 1. install
npm install

# 2. environment
copy .env.example .env.local      # Windows
# cp .env.example .env.local      # macOS / Linux
# then set AUTH_SECRET (npx auth secret) and optionally GEMINI_API_KEY

# 3. database
npm run db:push
npm run db:seed

# 4. run
npm run dev
```

Open <http://localhost:3000> and log in with the demo account, or create a fresh account through `/signup` and the onboarding wizard.

### Environment variables

```env
DATABASE_URL="file:./dev.db"
AUTH_SECRET="a-long-random-string"
AUTH_TRUST_HOST=true
GEMINI_API_KEY=""          # leave empty for demo mode
GEMINI_MODEL="gemini-3.6-flash"
```

The Prisma CLI reads `.env`, while Next.js also reads `.env.local` — keep `DATABASE_URL` in both.

---

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build + type check |
| `npm start` | Run the production build |
| `npm run db:push` | Sync the Prisma schema to SQLite |
| `npm run db:seed` | Recreate the demo account and data |
| `npm run db:reset` | Force-reset the database and reseed |
| `npm run db:studio` | Open Prisma Studio |
| `npm test` | Run Vitest (scheduler, SRS, grading) |

---

## Project map

```
prisma/
  schema.prisma        data model (User, Subject, Exam, Topic tree, PlanDay/Item,
                       FocusSession, Quiz/Question/Attempt/Answer, Flashcard/Review,
                       Note, AiMessage, DailyGoal, XpEvent, Achievement)
  seed.ts              demo account + realistic history
src/
  app/
    (app)/             dashboard, focus, roadmap, quizzes, flashcards, notes,
                       analytics, achievements, settings
    (auth)/            login, signup
    api/ai/chat        streaming assistant endpoint
    api/auth           Auth.js handlers
    onboarding/        first-run wizard
  components/          app shell, assistant drawer, Nova mascot, particles, charts,
                       syllabus editor, exam planner, forms
  lib/
    scheduler.ts       explainable weighted plan builder + fairness
    plan-service.ts    approved-leaf-topic mapping + plan generation + week window
    exams.ts           multiple exams, nearest-exam cache, legacy backfill
    topic-feedback.ts  quiz topic matching + mastery blending
    srs.ts             spaced repetition
    analytics.ts       readiness, weak topics, per-topic quiz accuracy
    gamification.ts    XP, levels, streaks, badge evaluation
    ai/
      gemini.ts        Gemini client, model fallback, JSON validation retries
      syllabus.ts      AI + local syllabus extraction, grounding validation
      study-tools.ts   chunked card/quiz generation, validation, local fallback
    files/             PDF/DOCX/image extraction, scanned-PDF detection, OCR queue
    actions/           server actions (auth, plan, focus, quizzes, cards, notes,
                       exams, syllabus, settings)
```

---

## How the adaptive bits work

**Plan generation.** Every schedulable topic gets an explainable priority score. The weights are exam urgency 30%, topic difficulty 18%, subject difficulty 10%, topic importance 9%, exam importance 5%, syllabus incompleteness 10%, preparation level 8%, recent quiz accuracy 6% and remaining effort 4%. Weak topics get a 1.15× boost and topics already mastered (≥80) are reduced to 0.65×. Urgency grows sharply as an exam approaches, so a difficult subject with a nearer deadline leads — but every active subject keeps a minimum daily share (`daily minutes ÷ active subjects`, clamped to 20–45 minutes), which stops an urgent easy exam from starving a later difficult one. The roadmap shows the concrete reasons behind each block, such as “Exam in 7 days · Very difficult · 65% syllabus incomplete”. New material is paced against a linear target curve, split into short 20–45 minute blocks (with brief wrap-up blocks when a topic is nearly done), and rotated across subjects. Nothing is scheduled after its exam, and the final 2–5 days before each exam (about 20% of the runway, capped at 5) are reserved for revision and practice quizzes. Revision rotates across every topic before repeating one. The roadmap opens on a rolling 14-day window with paging.

**Shared syllabus.** A note is the source of truth. Detecting a syllabus stores an **unapproved** chapter → topic → subtopic tree linked to the note and its subject; the roadmap ignores unapproved topics entirely, so a hallucinated or half-reviewed structure can never be scheduled. Chapters are containers and only leaf topics are scheduled, which prevents double-counting a chapter and all of its subtopics. Approving the tree marks the subject syllabus approved and regenerates the plan. Editing a topic, adding a manual topic, deleting or reordering also regenerates the plan once the syllabus is approved. Multiple exams per subject live in the `Exam` table; `Subject.examDate` is only a derived cache of the nearest upcoming exam, kept in sync by `src/lib/exams.ts`.

**Quiz feedback.** Submitting an attempt matches each question's topic label to the shared syllabus (exact normalized name first, then a conservative partial match), groups results per topic, and blends mastery as `60% prior + 40% latest accuracy`. A weak topic becomes `in_progress`, a solid one `studied`, and ≥85% `mastered`. Those mastery values, the per-topic quiz accuracy and the weak-topic flag all feed the next plan generation, so poor quiz performance genuinely raises a topic's priority and adds revision or practice.

**Re-planning.** Opening the dashboard or roadmap quietly checks for overdue, unfinished blocks. If any exist, StudyMaster rebuilds the open work from today and leaves completed blocks untouched; a notice explains what moved. The **Re-plan missed work** button runs the same pass manually. Overdue items are never stranded in the past.

**No empty days.** Between today and the furthest exam, the scheduler always fills a day with at least one block: new material, spaced revision, or a practice quiz. Revision is rotated across topics and spaced at least a day apart per topic, and a fallback revision block is added to any day that would otherwise be blank. Each block gets a real local start time based on the preferred study hour in Settings, with 5-minute breaks between blocks. Changing the daily budget or start time re-plans open work automatically.

**Resuming.** The dashboard's **Pick up where you left off** card looks for a paused focus timer, an unfinished flashcard session, or saved quiz answers in this browser, and otherwise points at your next unfinished plan block. The focus timer, flashcard deck and each quiz also restore their own progress on the page itself.

**Uploads & handwriting.** Files are parsed on the server and never stored — only their text is used. PDFs and DOCX files are read with `unpdf` and `mammoth`; PDF pages with no selectable text, plus PNG/JPG/WEBP photos, are transcribed by Gemini vision when `GEMINI_API_KEY` is set, and otherwise by a bundled local Tesseract worker (`tessdata/eng.traineddata`). Up to 40 scanned pages are transcribed per upload with three OCR jobs in flight and a 45-second budget; pages spread across the whole document are sampled first, and the UI tells you if any pages had to be skipped. The UI blocks files over 20 MB before they are sent so a large scan cannot break a server action.

**Readiness.** `35% syllabus completion + 35% quiz accuracy + 20% revision freshness + 10% consistency`. Freshness decays exponentially with days since a topic was last studied. Every component is shown separately so the score never feels like a black box.

**Weak topics.** Topics need at least three answered questions and accuracy below 60% to appear. They are surfaced on the dashboard/analytics and fed into the scheduler and AI context.

**Flashcards.** New + Medium → 1 day; second Medium → 3 days; then `interval × ease`. Easy jumps ahead (3 → 7 days); Hard resets to 1 day and counts a lapse. Ease is clamped to 1.3–3.2 and intervals to 1–180 days. A topic with under 60% quiz accuracy is capped at a 3-day interval.

**AI safety.** The assistant is prompted to give a hint first, then the method, then the answer, and to say when it is unsure. Without `GEMINI_API_KEY`, local generators still produce summaries, cards, quizzes and tutor-style replies so every feature is demoable offline.

**Generation quality.** Card and quiz prompts are grounded strictly in the supplied material: the model is told to use only facts that are present, to skip page numbers and OCR noise, to return fewer items instead of inventing content, and every result is re-validated on the server. Long documents are split into prompt-sized chunks sampled evenly across the whole file (first, middle and last pages), results are merged and de-duplicated, and the local fallback also samples candidates across the full source — so a 20-page upload does not collapse into one card from page one. Cards must test one idea with a real question or a single unambiguous blank; vague prompts, heading-only answers, worked examples and duplicates are dropped. Multiple-choice questions must have at least four unique options with the correct answer copied from one of them, true/false is always exactly True/False, and short-answer questions carry no options. If the material cannot support four plausible options, the local fallback produces grounded short-answer questions instead of filler. Empty or very short notes are rejected with a clear message before any generation runs.

**Syllabus extraction.** Automatic detection is AI-first with a strict chapter/topic/subtopic JSON schema. Every returned name must be grounded in the note (short names need all significant words present; longer names need at least 60%), generic headings such as “Introduction” or “Key concepts” are rejected, duplicates are removed and hierarchy is preserved. If the first response is unusable the model gets one correction prompt; if AI is unavailable or still returns nothing, a deterministic local parser reads real headings, numbered sections, bullets, definitions, formulas, processes and worked examples, keeping page/line references. If nothing structural exists, detection fails honestly with a clear message instead of inventing topics. Each chapter/topic/subtopic carries a source reference, difficulty, importance and estimated minutes, all editable before approval.

**AI safety and errors.** All AI calls return structured JSON that is validated before anything is shown. A failed or malformed response is retried once with a correction prompt; if it still fails, the local grounded generator takes over, and if that cannot produce valid content the UI shows a meaningful error instead of broken cards or questions. API keys stay server-side in environment variables. Gemini rate limits and model outages are caught, the configured model automatically falls back to `gemini-3.5-flash`, and generation never runs on every page load.

---

## Deploying to Vercel

1. Push the repo to GitHub and import it in Vercel.
2. Create a Postgres database (Neon, Supabase or Vercel Postgres).
3. Change the Prisma datasource provider to `postgresql` and set `DATABASE_URL` in Vercel.
4. Add `AUTH_SECRET`, `AUTH_TRUST_HOST=true` and `GEMINI_API_KEY`.
5. Run `npx prisma db push` (or add migrations) and optionally seed.
6. Deploy.

The schema deliberately avoids database enums and uses string statuses, so no data-model rewrite is needed for Postgres. SQLite files are not persistent on Vercel — Postgres is required there.

### Before a public launch

The local demo intentionally leaves out email verification, password reset, rate limiting on the AI endpoint, and push/email reminders. Those are the next four items on the roadmap.

---

## Testing

```bash
npm test
```

Covers the plan builder's daily budget, pacing across days, exam cut-off, revision window, quiz placement, explainable priority breakdown, multi-exam fairness, exam-date changes and preservation of completed work; the SRS transitions, ease clamps and accuracy cap; quiz grading including short-answer keyword overlap; syllabus grounding, hierarchy, de-duplication, local heading parsing and flattening; and quiz→topic mastery matching/blending.

```bash
npm test          # 82 tests across 8 files
npx tsc --noEmit  # type check
npm run build     # production build
```

Verified manually against the seeded demo account: dashboard, roadmap (both weeks), notes and note detail, flashcards library/study, quiz list/builder/detail/results, analytics, settings and achievements all return 200. The syllabus flow was verified end to end: a note produced 15 grounded rows from headings/bullets/definitions, those unapproved topics produced **0** roadmap blocks, and after approval the same syllabus produced 54 blocks (study, revision and quiz).

---

Built as a mini project with a simple rule: the app should feel like a calm, clever study partner — never a scolding dashboard.
