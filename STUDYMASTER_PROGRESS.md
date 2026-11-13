# StudyMaster progress

## Date: 2026-11-13 (SLOW SITE FIXED: Mumbai Supabase + bom1 functions; real DB discovered)

### Final state
- Production: https://studymaster-zeta.vercel.app — ALL 14 routes 200,
  warm click timings 0.4–0.9 s (was 5–18 s). Ping from function to DB: 2 ms.
- Database: NEW Supabase project `uehmkwhbtodruhxzmfgu` (ap-south-1 Mumbai,
  free tier). Data: demo seed (1 demo user / 4 subjects / 5 exams / 16 topics
  / 3 quizzes / 14 flashcards / 5 notes / 29 plan days) + imported real user
  ishitaprajapati1803@gmail.com (account row with password hash + biology
  subject + 1 exam + 1 daily goal). Counts now: 2 users / 5 subjects / 6 exams.
- Vercel function region: **bom1 (Mumbai)** — set via REST API
  (PATCH /v9/projects, field `serverlessFunctionRegion`; was iad1 US-East!).
- DB URL env: `APP_DATABASE_URL` = transaction pooler :6543
  (pgbouncer=true&connection_limit=5&pool_timeout=10). src/lib/db.ts reads
  APP_DATABASE_URL ?? DATABASE_URL.

### Root causes of the original slowness (three stacked problems)
1. Vercel function region was **iad1 (US-East)** — every request from India
   crossed the planet, and the Supabase marketplace integration set this
   silently. Fixed → bom1.
2. The integration **manages DATABASE_URL itself**: every CLI
   `vercel env rm/add DATABASE_URL` was a silent no-op, so the app always ran
   on the integration's transaction-pooler URL (1.1 s/query from US). Fixed
   via dedicated APP_DATABASE_URL read in code.
3. Session pooler :5432 (fast, 220 ms→2 ms after region fix) exhausts the
   free-tier `pool_size: 15` when ~15 serverless lambdas warm up
   (EMAXCONNSESSION 500s under load). Transaction pooler with both endpoints
   in Mumbai avoids per-lambda session holds; per-query overhead is now
   ~10–30 ms, so 6543 is the safe and fast choice.

### How the move was executed (home ISP to Supabase is flaky ~50%)
- Schema + seed + user import ran from INSIDE Vercel via a temporary
  /api/admin-setup route (token-gated, then deleted): stage=apply pushed 92
  DDL statements ($executeRawUnsafe), stage=reset truncated + ran the seed
  via exported seedPromise (prisma/seed.ts now exports it), stage=export /
  stage=import copied the real user across DBs preserving IDs.
- Old projects NOT deleted (data preserved): wyramcwptuuqwebsiyxf (Sydney,
  demo-only) and jhyhesjgqvwwbirmwgsb (Sydney, the app's ACTUAL previous
  production DB with the original user account). Recommend pausing both in
  the Supabase dashboard once satisfied (free tier prefers 2 active).

### Gotchas recorded for next time
- Supabase pooler hosts accept cross-region usernames (aws-1-ap-south-1...
  happily connected to a Sydney project) — verify region by timing from
  Vercel, never by hostname.
- `prisma migrate diff --script > file` via PowerShell captures npx stderr
  warnings into the file; strip before executing.
- Supabase circuit breaker (ECIRCUITBREAKER) trips on repeated failed
  handshakes from flaky ISPs; wait ~5 min and stop hammering.
- The Supabase access token pasted in chat was later revoked (it showed
  "Invalid access token" mid-session). No live secrets remain in chat.

## Date: 2026-11-12 (deployment VERIFIED: all routes 200 on Vercel + Supabase)

### Verified (two consecutive hosted e2e sweeps)
- https://studymaster-zeta.vercel.app — login OK; ALL 14 routes 200 with
  0 console errors and 0 AI calls across two full sweeps.
  Warm timings: dashboard ~4.0 s, roadmap 13.6–15.1 s (heaviest, first-hit
  planning page), everything else 2.9–6.7 s. Function region: bom1 (Mumbai).
- The earlier 500s (dashboard/flashcards) were the cold-start window right
  after the redeploy — old instances draining with the stale
  connection_limit=1 env; with the corrected env
  (pgbouncer=true&connection_limit=10&pool_timeout=30) they are gone.

### Fixes done this block
- prisma/dev.db restored to demo-only (deleted the OneDrive-resurrected
  ishitaprajapati1803@gmail.com; demo data intact: 4 subjects, 5 exams,
  23 plan days). prisma/_cleanup-devdb.mts kept as the record script.
- Vercel CLI linked (`vercel link --project studymaster`); owner
  ishitaprajapati1803-8742. Runtime logs confirmed function region bom1.
- prisma/_check-signout.mts now accepts a baseURL argument (verified against
  prod: login lands on https://studymaster-zeta.vercel.app/dashboard).

### Remaining (user's call, not bugs)
- Email verification / password reset: intentionally absent (own credentials
  auth, not Supabase Auth); needs an email provider (e.g. Resend) to build.
- Roadmap first-hit ~14 s on cold serverless; warm loads are fine.

## Date: 2026-11-12 (Vercel deployed; Supabase pool timeouts diagnosed; fix pending redeploy)

### Status
- Deployed: https://studymaster-zeta.vercel.app — login OK, roadmap/subjects/
  notes/quizzes/focus/settings OK (Supabase data live), but dashboard/
  flashcards/analytics/achievements returned 500 at ~10.3 s.
- Root cause confirmed via local reproduction: Prisma P2024 "Timed out fetching
  a new connection from the connection pool" (pool_timeout 10). The
  connection_limit=1 I put in the Vercel DATABASE_URL serializes ~20 parallel
  dashboard queries through one connection → queue exceeds 10 s → 500.
- Fix (validated mechanism locally, exact numbers pending hosted verify):
  DATABASE_URL → …:6543/postgres?pgbouncer=true&connection_limit=10&pool_timeout=30
  User must update the env var in Vercel and redeploy, then hosted e2e re-run.
- Local was temporarily pointed at Supabase for diagnosis (Postgres client
  regen); restored to SQLite per the standing decision — signout probe PASS,
  local instant again. db:local regenerate loop works cleanly.
- NOTED: local dev.db is a OneDrive-resurrected older copy that still contains
  ishitaprajapati1803@gmail.com; awaiting user decision on cleanup.
- Email verification: intentionally absent — app uses its own credentials auth
  (bcrypt + JWT), not Supabase Auth; README "Before a public launch" lists it.

## Date: 2026-11-12 (GitHub + Supabase deployment prep)

### Goal
Upload to GitHub (ishita1803/studymaster, public) and deploy on Vercel with
Supabase Postgres.

### Work done
- Audited repo for secrets: only `.env.local`/`.env` hold them (gitignored);
  `.env.example` is the safe template. Old backup DB `dev.db.bak-*` caught at
  staging and excluded (gitignore widened to `prisma/*.db*`); `schema.local.prisma`
  also ignored. 184 files in the initial commit, zero secrets/databases.
- Git identity set to ishita1803 + noreply email; initial commit b7df3ad.
- `postinstall: prisma generate` added to package.json (Vercel build requirement).
- Prisma datasource switched to `postgresql` with `directUrl` env; Supabase
  schema pushed (`prisma db push`) and demo dataset seeded successfully —
  verified: 1 user (demo), 4 subjects, 5 exams, 16 topics, 3 quizzes,
  14 flashcards, 5 notes, 29 plan days. Seed process doesn't exit cleanly
  (hangs at the end) but completes its writes.
- Supabase connectivity from this machine measured UNSTABLE: session pooler
  :5432 failed outright; direct :5432 and transaction pooler :6543 each
  ~50% connect success at 3–10 s (Prisma default 5 s timeout hit on failures).
  Earlier the same day a sustained 5-minute seed ran fine — ISP-level flakiness.
- DECISION (user-approved): local development on SQLite (prisma/dev.db,
  still intact with demo data), production on Supabase Postgres. New
  `npm run db:local` / `db:local:seed` (prisma/_make-local-schema.mjs)
  generates schema.local.prisma from the committed Postgres schema.
- `.env.local` back to `file:./dev.db`; `.env` holds the Supabase URLs for
  remote CLI ops (db:push / db:seed target Supabase).
- NOTED: local dev.db resurrected an old copy containing
  ishitaprajapati1803@gmail.com (deleted in the handover) — OneDrive
  rehydration artifact; local-only, gitignored, awaiting user decision.
- Gates: tsc clean, vitest 151/151, build green, e2e login OK / all routes
  200 / 0 AI calls / 0 console errors, sign-out probe stays on :3000.

### Supabase credentials (Vercel env vars to set)
- DATABASE_URL: postgresql://postgres.wyramcwptuuqwebsiyxf:<PW>@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1 (transaction pooler)
- NEXTAUTH_URL: the Vercel deployment URL; NEXTAUTH_SECRET: same value as local;
  AUTH_TRUST_HOST=true; GEMINI_API_KEY + GEMINI_MODEL same as local.

## Date: 2026-11-12 (login/logout redirected to localhost:3001 — fixed)

### User complaint
"when i am loggin in and logging out it is directing me to local host 3001 instead
of staying at 3000."

### Root causes
1. `.env.local` had `NEXTAUTH_URL="http://localhost:3001"` — NextAuth builds every
   sign-in/sign-out redirect from that URL.
2. A stale Node server (leftover from an earlier session when 3000 was busy) was
   actually listening on 3001, so the wrong-port redirect silently "worked" and
   served an old build instead of erroring.

### Fixes
1. `.env.local`: `NEXTAUTH_URL` → `http://localhost:3000`.
2. Killed the stale 3001 listener (pid 34516) and the old 3000 server, restarted.
3. First restart after the env edit: ALL routes returned 500 with nothing in the
   server log — the `.next` build was corrupted (missing required manifest files;
   attributed to OneDrive sync fighting build output). Full rebuild per protocol
   (`CI=1 npm run build` → `attrib +P -U /S /D ".next\*"`) fixed it; all routes 200.

### Verification (PASS)
- `prisma/_check-signout.mts` (new probe, kept for record): login lands on
  `http://localhost:3000/dashboard`; after sign-out lands on `http://localhost:3000/`
  — SIGNOUT-PORT: PASS (stayed on 3000).
- `prisma/_e2e-playwright.mts`: login OK, all routes 200, 0 AI calls,
  0 console errors; timings dashboard 1180 ms, roadmap 1518 ms, others 608–1324 ms.
- Rebuild protocol followed; single server on :3000.

## Date: 2026-11-12 (roadmap/scheduler redesign: sequential exams, no revision before study)

### User complaint
1. "How are you giving revision of a topic before actually allotting time to study it?"
2. With exams 5/10/15 days apart, later-exam content was being scheduled before the
   first exam — exam 1 effectively lost days to exam 2/3 material, while exams 2/3
   kept their full runways.
3. Required: at least the last 2 days before an exam contain only that exam's topics;
   the day after exam N starts exam N+1's topics.
4. If material cannot fit the available time, do NOT compress ("5 min per topic") —
   tell the user to increase their daily hours.
5. Plan like a real student preparing for multiple exams.

### Root causes (diagnosed in src/lib/scheduler.ts)
- `activeTracks()` returned the nearest exam PLUS every exam within
  `FOCUS_WINDOW_DAYS = 10` beyond it, all sharing the daily budget via `minShare` —
  that is the "later-exam content before the first exam" bug.
- The final revision window called `revisionCandidates(date, meta, true)`
  (`includeUnstudied`) — never-studied topics got 25-minute "revision" blocks
  without ever being studied.
- `capacityShortfalls()` measured each exam's study days from TODAY to its own
  revision start, ignoring that earlier exams consume the calendar — later exams
  looked feasible when they were not.

### Fixes (src/lib/scheduler.ts; plan-service untouched)
1. **Strictly sequential `activeTracks()`:** a day belongs to the track(s) whose
   exam equals the NEAREST upcoming date (same-day exams share the day, usually
   one). Work for a later exam begins the day after the earlier exam's date.
   With exams 5/10/15 days out the first 5 days contain only exam 1's topics,
   then exam 2's, then exam 3's — never mixed. `FOCUS_WINDOW_DAYS` removed.
2. **No revision before study:** `revisionCandidates` lost its
   `includeUnstudied` flag — only topics studied at least a day earlier are
   revisable (spaced revision, final window, quizzes, empty-day fallback all
   inherit this). In the final window, never-studied material gets honest
   `study` blocks ("Final window · not studied yet") at the normal 20–45 min
   block sizes — never "revision" relabelled, never squeezed into tiny
   minutes. Same-day exam siblings keep a fair share of the day (cram
   reservation mirrors the study-loop `minShare`).
3. **Sequential `capacityShortfalls()`:** exam N's study window starts at
   `max(today, previous exam date + 1)` and ends before its 2–5-day revision
   window; grouped by distinct exam dates so same-day exams share the slice.
   `CAPACITY_DAILY_MAINTENANCE = 45` and the no-compression contract kept:
   non-zero shortfalls drive the existing roadmap banner ("Too less time —
   increase your per-day study hours…") instead of shrinking blocks.

### Verification
- Tests: 4 new (three-exam 5/10/15 sequencing, no-revision-before-study
  invariant, sequential capacity windows, later-exam shortfall after earlier
  exams consume the calendar); one existing multi-exam test rewritten to the
  sequential contract ("plans exams one after another"). `npx tsc --noEmit`
  clean; `npx vitest run` **151/151 PASS**.
- Real demo data (4 upcoming exams: Biology mock today, Biology exam, Chemistry
  mock, Chemistry exam): plan rebuilt via `generatePlanForUser` and verified day
  by day (`prisma/_verify-sequential-plan.mts`):
  Nov 12 = Biology-mock topics only · Nov 13–16 Biology only (last 2 days
  revision-only) · Nov 17–20 Chemistry only (Nov 19–20 revision-only) ·
  Nov 21–24 Chemistry-final only (revision-only end). Study blocks precede
  every revision of the same topic. **PASS**
- Capacity at the demo's 2 h/day correctly reports shortfalls for all 4 exams
  (sequential windows are genuinely tight) → banner tells the student to
  increase hours; no block anywhere is compressed below the 20-min floor. **PASS**
- Prod rebuilt (`CI=1 npm run build` green, `.next` re-pinned), single server on
  :3000. `_e2e-playwright.mts` PASS (login OK, all routes 200, 0 console errors,
  0 AI calls). `_perf-clicks.mts` warm: roadmap ~0.8–1.2 s, subjects/notes/
  analytics ~0.3–0.7 s — all pages uniformly ~2× yesterday's settled baseline
  (incl. pages untouched by this change), consistent with OneDrive re-hydration
  after the rebuild; **NOT-VERIFIED** whether it fully settles (machine noise,
  fluctuates across runs).
- AI quiz/flashcard generation and topic extraction: **unchanged** by request.
- Record script kept: `prisma/_verify-sequential-plan.mts` (rebuilds the demo
  plan and prints the day-by-day sequencing + shortfalls for re-checks).

## Date: 2026-11-07 (working session)

### Done this session
1. **Compilation fixed.** `npx tsc --noEmit` now clean. Fixes:
   - `makeNode` in `src/lib/ai/syllabus.ts` now emits `origin` (+"confidence" for inferred nodes) — was breaking `SyllabusNode` after the origin/confidence fields were added.
   - `sectionsFromBlocks` return type in `src/lib/files/document-map.ts` now includes `introBody`.
   - Removed stray `scratch/extract_test.ts`; converted `prisma/_debug-quiz.ts` → `.mts`.
2. **Tests:** `npx vitest run` → 9 files / 107 tests pass (incl. study-tools 7, syllabus 10).
3. **Build:** `CI=1 npm run build` passes; `/dashboard` and `/subjects/[id]` compile.
4. **Real-PDF (43-page "chapters done.pdf") generation quality pass:**
   - `cleanTerm`: rejects lowercase-initial terms, JSON/identifiers, generic dictionary words ("model", "result", "name", …), 4+ word prose clauses with lowercase final word.
   - `cleanMeaning`: rejects JSON-schema bodies, formula fragments (𝑀 = 𝑆…), circled sub-bullet starts ("o Scenario…"), backtick/code content, short lowercase fragments (<6 words); trims glued bullet lists to first labelled fact.
   - true/false prompts now quote one clean sentence built from the definition, never raw labelled bullets.
   - Formula cards: front "Write the formula for: <section>", garbled >200-char fragments skipped.
   - Bullet markers ("• ", "o ") stripped from body sentences in the registry — this alone went from 4 → 40 grounded definitions (then gauges → 30 real ones across all 10 chapters).
   - Verified with `prisma/_gen-check.mts`: 12 quiz questions across 8 sections (pp. 2–41), 12 cards pp. 2–41, all with real page refs.

### Stage 2 (same session) — done & verified
1. **Merge + build gates:** `npx tsc --noEmit` clean; `npx vitest run` 9 files / 107 tests pass; `CI=1 npm run build` passes (all routes compile).
2. **Merge implemented:** `mergeSyllabusTopicsAction` in `src/lib/actions/syllabus.ts` (subtree-loop guard; children re-parented; planItem/quiz/flashcard/focusSession/generationJob/examTopic re-pointed with ExamTopic dup-delete; replan if approved). Editor UI: GitMerge button → purple "merge here" banner + per-row "Merge here" targets (`src/components/notes/syllabus-editor.tsx`).
3. **Approved-syllabus source of truth:** quizzes `resolveContext`, flashcards `resolveCardSource`, and `runFlashcardJob` now query topic candidates with `approved: true` only.
4. **Deletions w/ confirmations:** `deleteAllTopicsAction` added (keeps subject + notes, clears syllabusApproved). `ConfirmDeleteDialog` gained `fieldName` prop. Wired: roadmap panel Delete Subject + Delete topics, per-topic delete, quiz list per-quiz delete, flashcards per-card delete, exam delete in exam planner. Exams: planner delete now confirmed.
5. **Progress infra:** `src/components/ui/pending-progress.tsx` — `ProgressTrack` (indeterminate band), `PendingBar` (track + rotating stage text), `PendingSubmit` (submit button using `useFormStatus`, rotating stage label, blocks double submits), stateful variant for action-state forms. CSS: `.progress-range` band animation in `globals.css`.
   Wired into: note create/save (upload stages), note summarize, note→cards/quiz buttons, syllabus detect (note + subject), approve & plan, quiz builder AI generate, subject upload panel, roadmap rebuild/re-plan buttons, dashboard build-today/re-plan, exam planner add/save-date/save-topics. Flashcards keep the real-% `GenerationJob` poller. Nova drawer already streams tokens (no change needed).
6. **Dev indicator:** `devIndicators: false` in `next.config.ts`.

### Stage 3 (same session) — extraction fix + DB repair, done & verified
1. **Extraction fix for single-unit/lecture-slide PDFs** (user's new "python unit 1" note, a 53-page AKTU unit deck, exposed gaps the old 43-page doc did not):
   - `document-map.ts`: repeated page headers ("UNIT -1: Introduction to Python" on every slide page) no longer open a new chapter — `continuesRunningChapter()` merges a re-occurring heading with the same number+overlapping title into the running chapter. This killed the fake "Chapter 1 (pp. 2-13)/(13-24)/(24-42)/(42-53)" page-range chapters.
   - `document-map.ts`: pre-chapter preamble (cover/official-syllabus page) is attached to the first chapter instead of being silently dropped; chapter startPage adjusts.
   - `document-map.ts`: `bulletLead` rejects names ending in a connector word (a/an/the/of/from…).
   - `syllabus.ts`: `officialSyllabusTopics()` parses the wrapped AKTU statement ("Introduction to Python: Python variables, Python basic Operators, Understanding python blocks. …") across multi-line intro blocks into real topics with page refs; item gates reject prose/code fragments (quotes, sentence-continuation lead words, "etc." tails, <2 items). Trailing-connector names rejected in `cleanName`.
   - `extractSyllabus` now uses the map path for a single explicitly-numbered chapter with real content (single-unit docs previously fell to the weak legacy line parser).
   - Verified: python doc → 1 chapter (pp. 1-53) with topics "Python variables / Python basic Operators / Understanding python blocks / Python Data Types / Declaring and using Numeric data types / Introduction to Python"; the 43-page resume doc extracts unchanged; `tsc` + 107 tests + `CI=1 npm run build` all green after.
2. **DB repair (backup `prisma/dev_backup_20261107_roadmap_repair.db` made first)** for subject `cmw1ov3q900aotodov4vfpsci`: old exam + old topics no longer existed; stale topics were 4 fake page-range chapters + fragments (verified 0 attached quizzes/flashcards/plan items). Re-ran per-note detect (like `detectSyllabusAction`), stored via `storeDetectedTopics`, approved all + subject, recreated exam `Python Unit 1 — Introduction to Python` dated 2026-12-10T00:00 local with all 6 approved leaf topics, ran `generatePlanForUser`.
3. **Roadmap DB verification (requirements 6/7)**: user now has 34 plan days 2026-11-06 → 2026-12-10 IST (no 14-day cap). Dec 9 IST (day before exam, `2026-12-08T18:30Z` row) contains only miniproject items (3 revision + 1 practice quiz) — reserved exclusively for that exam. Dec 10 IST row present. Demo user's plan untouched.

### Stage 4 (same session) — done & verified
1. **Stuck-loading guard (flashcards):** the `GenerationJob` poller in `src/components/flashcards/card-tools.tsx` now stops after MAX_TICKS=200 (~4 min with no completion), surfaces a retry message ("generation never finished — the server may have restarted — submit again"), and resets the UI so the button is never permanently locked. `stuck` clears on the next submit.
2. **HTTP E2E (plain-Node harness, `prisma/_e2e-pages.mts` + `_e2e-user.mts`):** all 11 app pages (/dashboard, /roadmap, /subjects, /notes, /quizzes, /quizzes/new, /flashcards, /flashcards/study, /focus, /analytics, /settings) rendered 200 with real HTML and no error boundaries for a real logged-in user. Dev-server log confirmed: cold-compile first touches, then every page 200 in ~1–1.4 s (dev mode, incl. compile). Public pages /, /login, /signup render 200; `GET /api/ai/chat` → 405 (expected). The throwaway `e2e-check@studymaster.app` account was deleted after the run.
3. **Dev indicator removed without hiding errors:** `devIndicators: false` in `next.config.ts` — runtime error overlays/errors are unaffected.
4. **Perf:** `/settings` queries converted to `Promise.all` counts; no further rewrite — warm dev page loads are 1–1.4 s which is compile/overhead-bound, not query-bound.
5. **Cleanup:** throwaway debug scripts deleted (`_debug-quiz`, `_e2e-onboard`, `_e2e-delete`, `scratch/*`). Kept as regression harnesses: `prisma/_gen-check.mts` (generation quality vs the real 43-page PDF), `prisma/_syllabus-check.mts` (syllabus extraction), `prisma/_e2e-pages.mts` + `_e2e-user.mts` (HTTP page smoke). My background dev server (port 3002) was stopped; the port 3000 listener is another, pre-existing process and was left untouched.
6. **Final gates re-verified after all edits:** `npx tsc --noEmit` clean; `npx vitest run` → 9 files / 107 tests pass; `CI=1 npm run build` → compiled successfully, all routes emitted.

### Session 2026-11-08 — Syllabus/Notes split + Gemini quota guard (in progress)
Plan (staged, gates re-run after each stage — `npx tsc --noEmit`, `npx vitest run`, `CI=1 npm run build`):
1. **DB backup** `prisma/dev_backup_20261108_sections_quota.db`, then additive schema: `Note.role` ("syllabus" | "notes"), `Note.topicId` (association), `Subject.syllabusSourceHash`, `Note.syllabusSourceHash`. `prisma db push` only — no reset.
2. **Gemini quota guard** (`src/lib/ai/gemini.ts`): global request queue (concurrency 1 via `GEMINI_MAX_CONCURRENCY`), rolling RPM window (5 via `GEMINI_RPM`), exponential backoff on 429/RESOURCE_EXHAUSTED honouring server `retryDelay`, hard caps (≤4 attempts, ≤100 s budget) then clear `AiQuotaError`, in-flight request deduplication, no model-fallback on rate-limit errors (fallback only on model-not-found).
3. **Call-count reduction**: syllabus extraction → max 2 AI calls per extraction (chapters beyond that use the local parser; drop the "empty first response" retry); flashcards/quiz generation → max 2 AI batches each (was 5–6 + retries), gap-filling stays local; quiz builder errors when there is no real material instead of sending bare topic names to Gemini; OCR calls flow through the same queue.
4. **Two sections per subject**: `[id]/page.tsx` split into a **Syllabus** card (official-syllabus upload → `uploadOfficialSyllabusAction`, editor, approve) and a **Notes** card (lecture upload → `uploadSubjectNoteAction`, no extraction, list, per-note delete, topic association chip). Note uploads can never touch topics/roadmap.
5. **Reprocess skip**: hash of source contents per subject/note; unchanged documents redirect with "already up to date" instead of re-running extraction.
6. **Perf**: lazy Suspense sections on subject page; verify navigation triggers zero Gemini calls via dev log + network interception.
7. **Testing**: vitest unit tests for queue/backoff/dedup/hash; Playwright (new) E2E: login → navigate all pages (only 200s, zero AI calls), subject sections visible; real-PDF regression via `_syllabus-check.mts`. Before/after dev page timings recorded.

### Verified results (stages 1–6 complete)
- **Unit gates**: `npx tsc --noEmit` clean · `npx vitest run` **121 tests / 11 files pass** · `CI=1 npm run build` green.
- **Playwright E2E** (`prisma/_e2e-playwright.mts`, chromium against prod server, session cookie via UI login):
  - login OK → /dashboard;
  - all 13 routes HTTP 200, 0 console errors: dashboard 514 ms, subjects 403 ms, notes 516 ms, quizzes 544 ms, flashcards 662 ms, focus 399 ms, analytics 500 ms, settings 634 ms, achievements 424 ms (roadmap 2672 ms on first prod hit);
  - subject page renders **Section 1 · Syllabus** (official-syllabus upload form + editor) and **Section 2 · Notes** (lecture upload + list) — all 6 structural checks OK, subject page 379 ms;
  - **AI network calls during the entire navigation run: 0**; verified again by server log (no `[nova]` lines, no gemini requests).
- **Hash-skip E2E** (`prisma/_e2e-hashskip.mts`): stored the action-computed `syllabusSourceHash` for the demo subject, clicked "Re-detect all documents" in the browser → redirect `/subjects/…?syllabus=current&count=5` in 783 ms, "already up to date" banner verified, **0 Gemini calls** (second detect of unchanged documents no longer reprocesses).
- **Notes workflow E2E** (`prisma/_e2e-notes-flow.mts`): uploaded a .txt lecture note ("Lecture 12 — Photosynthesis") through the Notes form → `?note=added`, note listed, "It never changes the syllabus" banner OK, **topic association chip matched "Photosynthesis"** (approved-topic matching works), then deleted → `?note=deleted`, removed. **0 AI calls** for the whole workflow.
- **Exam topic-selection E2E** (`prisma/_e2e-exam-topics.mts`): created "E2E topic selection test" through the real planner → redirect `?examAdded=1`, and the DB stored **exactly the single selected topic** (`examTopics: [cell-division-id]`); fixture exam deleted afterwards. Selection only ever offers approved leaf topics (roadmap/page.tsx:449-455). **0 AI calls**.
- **Warm page timings** (`prisma/_e2e-perf.mts`, prod server steady state): dashboard 121–131 ms, subjects 134 ms, notes 122 ms, quizzes 140–189 ms, quizzes/new 103–118 ms, flashcards 105–237 ms, focus 139–352 ms, analytics 141–157 ms, settings 119–125 ms, achievements 278 ms; roadmap is the heaviest at 540–1400 ms (per-topic plan aggregation). Zero Gemini calls on every hit.
- Guard now logs quota retries (`[nova] rate-limited, attempt n/4, retrying in Xs`) so 429 backoff is visible in dev/prod logs.
- Hot-reload/regeneration verified: `npx tsc --noEmit` clean, `npx vitest run` 121/121 after all changes.
- **Live quota evidence**: one raw request probe → `429 RESOURCE_EXHAUSTED`, `Quota exceeded for metric: generate_content_free_tier_requests, limit: 20` (requests/day) with `retryDelay ≈ 3438 s`. Live extraction through the guard aborted cleanly with `AiQuotaError` + friendly message after bounded backoff — **no model-fallback duplication, no retry storm** (compare the captured old log: dozens of 429 lines across two fallback models per failure). An API_KEY_INVALID artifact seen in probes was caused by quoting in `.env.local`, not the app (dotenv strips quotes; only the raw tsx probe misparsed).
- Local PDF path verified unchanged: offline extraction of `chapters done.pdf` → engine `local`, 10 chapters / 179 rows, 95 ms, 0 AI calls.

### In progress / next
- Live Gemini verification scheduled: background job waits for the daily quota reset (~1 h) → raw probe → `prisma/_syllabus-check-live.mts` (real 43-page PDF through the guarded extractor; expected `guard stats after.sent ≤ 2`). Will report when it completes; until then generation success is documented as quota-gated with live abort evidence above.
- Final report: files changed, API calls saved, before/after timings.

### Env facts
- Real PDF: `C:\Users\Lenovo\OneDrive\Desktop\miniproject\chapters done.pdf` (43 pp, 10 chapters, refs pp. 42–43).
- Subject id `cmw1ov3q900aotodov4vfpsci` (miniproject), exam dated 2026-12-09T18:30Z (= 10 Dec IST), user ishitaprajapati1803@gmail.com. DB must NOT be reset; backup before risky changes.
- PDF scripts: use `.mts` (tsx), stderr shows unpdf "TT: undefined function: 21" noise — run with `2>$null`.
- Gemini live often 429/503 → local engine paths must stay standalone (they currently do).

---

## Date: 2026-11-09 (final-integration session)

### Scope this session
Per-exam Easy/Medium/Hard topic ratings → difficulty-weighted roadmap; mandatory AI
content-understanding stage before flashcards/quizzes; AI-provider robustness fixes;
full gate suite (tsc / vitest / build / Playwright / controlled live AI).

### Files changed
- `prisma/schema.prisma` — no edits needed: `ExamTopic.difficulty` ("easy"|"medium"|"hard",
  default "medium") was already present and pushed (`prisma db push` reports "already in sync").
- `src/lib/actions/exams.ts` — `resolveSelectedTopicIds` now returns `{topicId, rating}[]`,
  reading `difficulty_<topicId>` form fields per selected topic (a chapter's rating expands
  to its leaf topics); create/update persist the rating on each ExamTopic row.
- `src/components/roadmap/exam-planner.tsx` — topic checklist renders a disabled-until-checked
  Easy/Medium/Hard `<select name="difficulty_<topicId>">` per topic; `ExamRow.topicRatings`
  carries saved ratings into the edit form (restored defaults; add form defaults "medium").
- `src/lib/exams.ts` — `listUpcomingExams` now selects `examTopics: { topicId, difficulty }`.
- `src/app/(app)/roadmap/page.tsx` — passes a `topicRatings` map into the planner component.
- `src/lib/exam-rating.ts` (NEW) — rating → weighting helpers: minutes factor easy 0.8 /
  medium 1.0 / hard 1.5; scheduler difficulty 2 / 3 / 4; unknown ratings → medium
  (legacy whole-subject exams keep the historical behaviour).
- `src/lib/plan-service.ts` — each exam-track topic uses its own exam's rating:
  `difficulty: ratingSchedulerDifficulty(rating, topic.difficulty)` and
  `estimatedMinutes: max(5, round(baseline × ratingMinuteFactor(rating)))`. Earlier-exam
  priority and day-before-exam reservation were already in place and untouched.
- `src/lib/ai/content-study.ts` (NEW) — mandatory content-understanding stage: reads EVERY
  chunk of the joined note text (whole documents), builds an outline via the document map,
  collects concepts/definitions with the grounded registry pipeline, derives concept relations,
  then at most ONE Gemini synthesis over the full-document view (output validated against the
  source, so nothing fabricated enters the record). SHA-256 cache shared by card + quiz
  generation. `InsufficientMaterialError` (clear message) when the material has < 250 readable
  characters or < 6 sentences — the app shows the error instead of inventing questions.
- `src/lib/ai/study-tools.ts` — `splitSource` exported; `makeFlashcards` and `makeQuiz` both run
  `studyContent(source)` before any batch; "Studied N sections — K key concepts understood"
  progress stage; the understanding's key concepts go into every AI batch prompt
  (`requestCards`/`requestQuestions` gained `focusTerms`).
- `src/lib/actions/flashcards.ts`, `quizzes.ts`, `notes.ts` — catch `InsufficientMaterialError`
  and surface its clear message (redirect / `{error}`).
- `src/lib/ai/gemini.ts` — robustness fixes: ① the inflight-tracked dedupe promise no longer
  raises an unhandled rejection (the real cause of yesterday's "uncaught 503" crash — any
  single failed AI request could kill the process); ② malformed/truncated model JSON is treated
  as empty (local fallback) instead of throwing `SyntaxError`; ③ per-day 429 quota rejections
  abort immediately (quotaAborts=1, no 5/10/20 s retry storm that can never recover) while
  transient 429s still back off; ④ model fallback widened ONLY for 503/500 UNAVAILABLE
  (transient, consumes no quota → at most 1 extra call on the second model); 429 never falls
  back (unchanged).
- `prisma/_syllabus-check-live.mts` — prints guard stats + friendly verdict on provider failure
  instead of crashing.
- `prisma/_gen-check-live.mts` (NEW) — controlled live pipeline test: insufficient-gate 0-call
  proof, makeQuiz, then cached makeFlashcards, with aiGuardStats accounting.
- `prisma/_e2e-exam-topics.mts` — extended to TWO topics + per-topic ratings + DB minutes check.
- `prisma/_probe-integrity.mts` (NEW) — data-preservation probe (counts + reserved exam).
- Tests: `src/lib/__tests__/exam-rating.test.ts` (NEW, 7 asserts), `content-study.test.ts`
  (NEW, 6: whole-document study, grounded concepts, no fabricated concepts, empty/title-only/
  short refused, cache identity, material isolation), `gemini-guard.test.ts` (+2: no unhandled
  rejection on a failed tracked request; per-day 429 aborts on attempt 1).

### Verified results (PASS unless noted)
- **Unit gates**: `npx tsc --noEmit` clean ✔; `npx vitest run` **134 tests / 13 files pass** ✔
  (121 previous + 13 new, none weakened); `CI=1 npm run build` green ✔; prod server restarted
  on the rebuilt output and the E2Es re-run against it.
- **PASS — per-exam ratings E2E** (`prisma/_e2e-exam-topics.mts`, demo subject, real planner UI):
  two leaf topics checked ("Cell division" rated hard, "Genetics & inheritance" rated easy),
  submit → `?examAdded=1`, DB shows exactly those 2 ExamTopic rows with `difficulty=hard` and
  `difficulty=easy` — per-exam storage verified, 0 AI calls, fixture deleted after.
- **PASS — difficulty-weighted roadmap (DB evidence)**: after submission the plan regenerated
  with `Cell division` (baseline 90 m, hard ×1.5) scheduled at **exactly 135 m**, and
  `Genetics & inheritance` (baseline 120 m, easy ×0.8 → 96 m) at **120 m** (30-min scheduler
  session granularity rounds 96 m up); hard ≥ easy holds. Deterministic weighting math is
  unit-covered (`exam-rating.test.ts`: 45 m vs 24 m for the same 30 m baseline).
- **PASS — notes workflow regression**: `_e2e-notes-flow.mts` all checks OK (upload → listed →
  syllabus-untouched banner → topic association chip → delete), 0 AI calls.
- **PASS — navigation/routes** (`_e2e-playwright.mts` against the new build): all 14 URLs
  HTTP 200, 0 console errors, subject page syllabus/notes/editor checks OK, roadmap planner OK;
  **0 AI network calls during the entire run** (AI stays out of navigation). Timings:
  dashboard 217 ms, roadmap 717 ms, subjects 206 ms, notes 363 ms, quizzes 200–687 ms,
  flashcards 331–348 ms, focus 397 ms, analytics 419 ms, settings 438 ms, achievements 455 ms,
  /subjects/… 608 ms.
- **PASS — live Gemini syllabus extraction** (controlled, real 43-page PDF): quota probe
  `SUCCESS: ok` first; live run returned `engine: ai`, all 10 chapters, 207 flatten rows,
  62,562 ms, `guard stats: sent 4, retries 0, dedup 0, quotaAborts 0` — 2 logical chapter
  refinement requests (hard cap 2) including one 503-fallback attempt. This also proves the
  503-fallback policy against the real provider.
- **PASS — AI-robustness fixes exercised live**: the end-to-end `_gen-check-live.mts` run
  completed cleanly under a **fully exhausted daily quota**: the insufficient-gate refused a
  34-character snippet with **0 AI calls**, quiz/card batches degraded to the local
  (never-inventing) generators with clearly grounded output, and **no crash / no unhandled
  rejections** — the three failure modes that crashed or stalled yesterday (tracked-inflight
  unhandled rejection, truncated JSON SyntaxError, per-day 429 retry storm) are now all fixed
  and unit-covered.
- **PASS — insufficient-material gate (offline)**: a 34-character snippet and a title-only line
  refused with clear messages, 0 AI calls (live + unit).
- **DB preservation — PASS**: backup `prisma/dev_backup_20261109_exam_ratings.db` taken before
  work (909,312 B); nothing restored/reseeded; integrity probe after all E2Es: users 3,
  subjects 6, topics 32, notes 10, exams 6 (including the real user's reserved
  `Python Unit 1 — Introduction to Python` exam `cmw6avxig000ftocov75f1cvw`,
  date 2026-12-09T18:30Z, subject `cmw1ov3q900aotodov4vfpsci`), cards 14, quizzes 5,
  planDays 73, planItems 258, demo Biology subject present. ExamTopic rows back to 0 only
  because the ratings fixture exam was cleaned up. Real user data untouched.
- **Secrets**: no `.env`, `.env.local` or credential changes.

### Remaining blockers / NOT VERIFIED
- **A fully-AI (not fallback) card/quiz capture under fresh quota — NOT VERIFIED (provider-bound
  only).** The pipeline was exercised live end-to-end today, but the free tier's daily window
  flipped to per-day 429 mid-run, so the final batch outputs could not be captured from Gemini.
  Earlier live runs did prove: provider reachability (engine `ai` extraction), the 503 fallback
  policy, and full graceful degradation. One controlled check on a fresh quota day is expected
  to show `sent ≈ 5` (1 study synthesis + ≤2 quiz batches, cards reusing the cache) with the
  cards/quizzes linkable to real PDF content.
- Cross-exam re-checks (earlier-exam priority re-ranking, day-before reservation after a rating
  edit) were not re-captured today for the demo subject since it only had the fixture exam;
  those paths were verified in previous sessions and their code is untouched.
- PowerShell `Select-Object -First N` on native process output can terminate tsx early
  (misreads as crash) — prefer redirect-to-file for probe output.

---

## Date: 2026-11-10 (performance incident: "every click takes 7–8 s")

### Root causes found (both real, both fixed — PASS with evidence)
1. **Broken production build → no hydration.** The `.next` directory had lost files
   (marked in-progress while OneDrive placeholders were re-dehydrating them). `next start`
   served pages but returned **HTTP 400 for every `/_next/static/**` chunk and CSS file**
   (reproduced with `_debug-login.mts`: all asset requests 400, login clicked → native
   GET form submit to `/login?email=…&password=…`, never navigated). Without JavaScript,
   every button/link click either did nothing or fell into slow full-document reloads —
   this is what the user experienced as 7–8 s response times. **Fix:** fresh
   `CI=1 npm run build`, restart `next start`, verified assets now 200, browser login
   navigates in ~3.0 s end-to-end (auth + dashboard SSR) and every interaction re-times
   fast (below). Prevention: `.next` pinned "always keep on this device"
   (`attrib +P -U /S /D .next\*`) so OneDrive cannot dehydrate the build again.
2. **Leftover `next dev` watcher + zombie server** (one `npm run dev` process tree and a
   second stale `next start` on \:3001) were churning the same OneDrive project folder
   (file watching + webpack rebuilds) while an unused port competed with the prod server.
   **Fix:** all stray processes killed; exactly one `next start` (prod, port 3000) remains.

### Perf code fixes this session
- `src/lib/exams.ts::syncSubjectExamDate` — the roadmap called this on **every page
  visit** and it always ran a `subject.update` per subject (SQLite write lock per
  navigation even when nothing changed). Now compares first and writes only when the
  derived exam date actually drifted — steady-state page loads do zero writes.
- `src/app/(app)/subjects/[id]/page.tsx` — the heavy subject query and the four
  flashcard/note counts were two sequential round trips; now one `Promise.all`
  (counts are user-scoped, safe beside the ownership check; `notFound()` guard kept).

### Verified results
- **Unit gates**: `npx tsc --noEmit` clean ✔; `npx vitest run` **134 / 134 pass** ✔;
  rebuild green and `.next` re-pinned.
- **Static assets**: `/_next/static/css/*.css` and chunk JS all HTTP 200 after the rebuild
  (were 400 before the fix).
- **Interaction timings** (`prisma/_perf-clicks.mts`, real clicks in chromium, warm pass):
  login 2.2 s (one-time auth + first SSR; raw callback POST alone is 330 ms),
  roadmap click 481–565 ms, subjects 149–181 ms, notes 148–346 ms, flashcards 128–274 ms,
  analytics 138–350 ms, dashboard 247–280 ms, subject page 0.85–1.11 s (first-hit cold
  2.7 s). Cold server first-run showed 1.2–2.7 s for the two heaviest routes, which is
  the production in-process module/cache warm-up, not user-visible after the first visit.
- **Regression battery vs new build**: `_e2e-playwright.mts` all 14 URLs HTTP 200,
  0 console errors, 0 AI network calls, first-hit timings 66–901 ms;
  `_e2e-exam-topics.mts` ratings + weighting still PASS (hard ≥ easy in plan minutes).
- **DB**: untouched — no resets; the sync fix reduces writes, never changes data.

### Advice recorded for the user
- Use **http://localhost:3000** (the prod server). If `npm run dev` is also running, stop
  it — dev-compilation watches the whole OneDrive project and will make every first visit
  take seconds. Keep only one server process running.
- If the browser tab was opened while the build was broken, do one hard refresh
  (Ctrl+Shift+R) so it drops cached 400-chunk versions.
- Keep OneDrive from dehydrating `.next` (done via the attrib pin above); if the site ever
  "loses its styling/interactivity again", the fastest check is: reload after a fresh
  `npm run build && npm start`.

---

## Date: 2026-11-10 (feature session: smart topics, 1–5 ratings, insufficient-time banner, delete subject, teacher-style generation)

### Feature 1 — "weird topics" extraction gate (PASS with data as evidence)
- Root cause confirmed by read-only probe (`prisma/_probe-topics.mts`): the real subject
  `miniproject` had 3 DRAFT topics — `"miniproject"` (subject name echoed as a chapter),
  `"PYTHON PROGRAMMING"` and `"AKTU SYLLABUS UNIT-1"` (all-caps cover-banner headings).
  Drafts were never scheduled (plan-service filters `approved: true`), but they polluted
  the syllabus editor.
- `src/lib/ai/syllabus.ts`:
  - New `isCoverBannerName()` — rejects multi-word names where every alphabetic word of
    ≥3 letters is fully UPPERCASE (banners), while acronym topics like "OSI Model",
    "DNA Replication", "SQL Queries" still pass.
  - `cleanName()` now runs the banner gate.
  - **Key catch**: `localSyllabus` used raw `line.heading.title` for heading-derived
    nodes, bypassing `cleanName` entirely — banners used to slide in through that path.
    All three heading branches now route through `cleanName` + `isGenericName` too
    (also rejects a chapter literally named after the subject via the existing context check).
- Tests added (`syllabus.test.ts`): banner flags + a `localSyllabus` run over a
  banner-polluted fixture asserting `"PYTHON PROGRAMMING"` / `"AKTU SYLLABUS UNIT-1"` are
  absent and `"Python Basics"` survives. Existing DB rows deliberately NOT touched
  (drafts are user data; they vanish next re-detect or via the topic editor).

### Feature 2 — per-topic rating upgraded Easy/Medium/Hard → 1–5 (PASS)
- `src/lib/exam-rating.ts`: new factor map `1→0.6 / 2→0.8 / 3→1.0 / 4→1.35 / 5→1.7`,
  scheduler difficulty `= rating`, legacy words still readable (`easy→2, medium→3,
  hard→4` so old ExamTopic rows keep their weighting). Unknown → "3" (medium), unchanged.
- `src/lib/actions/exams.ts::normalizeRating`: accepts `"1".."5"` + legacy words,
  default `"3"`.
- `src/components/roadmap/exam-planner.tsx`: select shows `1 · Very easy … 5 · Very hard`
  (default 3) and a `normalizeLegacyRating()` so pre-existing exams display as 2/3/4.
- Tests rewritten in `exam-rating.test.ts` (factor steps strictly increasing, legacy
  mapping, unknown fallback).
- E2E (`prisma/_e2e-exam-topics.mts` updated): rates one topic "5" and another "2";
  stored ratings `5`/`2` verified; plan minutes 150m vs 120m consistent with the 1.7× / 0.8×
  factors; hard ≥ easy holds. PASS.

### Feature 3 — insufficient-time banner on the roadmap (PASS)
- `src/lib/scheduler.ts`: new read-only `capacityShortfalls(topics, options)` — mirrors
  `buildPlan`'s window math (revision-window reservation before each exam, day-before
  exam dedicated to that exam, mastered topics excluded, 45 min/day maintenance reserve
  for the revision/quiz blocks that share each study day) and reports per exam:
  requiredMinutes vs availableMinutes vs shortfall. Documented as kept-in-sync.
- `src/lib/plan-service.ts`: new `capacityShortfallsForUser(userId)` — same
  exam-selection + rating-weighting rules as `generatePlanForUser` (shared code path),
  read-only.
- `roadmap/page.tsx`: capacity runs inside the existing `Promise.all`; when a shortfall
  exists the page shows exactly the requested message: **"Too less time — increase your
  per-day study hours until you are satisfied by the roadmap."** plus per-exam numbers
  (needs X of material · only Y fits · short by Z).
- Live check (demo): banner SHOWN for a 2-day-away exam with 2h15m remaining material
  and no fitting capacity; the three further exams correctly show no warning.
- Tests added in `scheduler.test.ts` (fits / short / exam-tomorrow: 0 study days /
  mastered excluded). PASS.

### Feature 4 — delete a subject (PASS, E2E exercised)
- `deleteSubjectAction` already existed on the roadmap syllabus panel; completed it with
  the missing piece: `generationJob.deleteMany({ subjectId })` so queued/running AI jobs
  don't run against a vanished subject (transaction: planItems → GenerationJob →
  examTopics → exams → flashcardReviews → flashcards → answers → questions →
  quizAttempts → quizzes → topics → notes → extractionReports → subject → plan rebuild).
- NEW danger zone on the subject page itself (`/subjects/[id]`): "Danger zone · Delete
  subject" card with the `ConfirmDeleteDialog` (double-confirm, lavender/cream styling).
- E2E `prisma/_e2e-delete-subject.mts`: disposable subject + note + flashcard → deleted
  through the real dialog → subject/note/flashcard cascade OK, the reserved real exam
  untouched. PASS.

### Feature 5 — teacher-style meaningful generation (code PASS; AI-verified NOT YET)
- `src/lib/ai/study-tools.ts`: new `studyBriefOf(study)` — turns the mandatory
  content-understanding stage (outline + concepts **as the notes define them** + their
  relations) into a compact brief that is injected into every card/quiz generation call.
  `makeFlashcards`/`makeQuiz` now send it (so even per-chunk batches know the whole
  document's map of what matters).
- `requestCards` prompt now demands: think like a teacher drilling students, cover the
  important topics across the WHOLE material, prefer how/why/compare/apply questions;
  explicitly forbids "copy a sentence from the material and blank or reword it into a
  'statement question'".
- `requestQuestions` prompt now demands: read and understand first, then design exam
  questions testing conceptual understanding/reasoning/relationships/application;
  NEVER treat the material as a block of statements; spread questions across the whole
  material like a balanced paper; distractors grounded in common misconceptions (strict
  MCQ/truefalse/match/short/long/application/problem rules unchanged).
- The insufficient-material gate from 2026-11-09 (notes must contain real content)
  is unchanged and still upstream of both.
- **AI-output quality under fresh quota: NOT VERIFIED** — provider-bound (Gemini free
  tier daily 429). Re-run `prisma/_gen-check-live.mts` on a fresh day and inspect a real
  quiz/flashcard batch for sentence-block questions before claiming full verification.

### Session gates + regressions
- `npx tsc --noEmit` clean; `npx vitest run` **141 / 141 pass** (7 new tests, none
  weakened); `CI=1 npm run build` green; `.next` re-pinned; single prod server on :3000.
- Full Playwright battery `_e2e-playwright.mts`: all routes 200, 0 console errors,
  0 AI calls on navigation. Warm clicks: roadmap 528 ms, subjects 278 ms, notes 195 ms,
  flashcards 259 ms, analytics 264 ms, dashboard 418 ms (roadmap capacity check adds ~0
  warm cost; first-visit compile of the new path takes a one-time ~4.7 s).
- DB untouched except a disposable E2E subject (deleted by design) and one E2E fixture
  exam (cleaned up by its script). Reserved real exam `cmw6avxig000ftocov75f1cvw`
  verified intact before and after. Backup `prisma/dev_backup_20261110_video_features.db`
  taken before the session's risky work.

## Date: 2026-11-10/11 (AI generation broken: diagnosis + fix, no new key needed)

### User question
"Flashcards, quizzes, topic extraction, syllabus — everything AI is not generating.
Is it a limit issue? Will a new API key fix it? Can it be fixed without a new key?"

### Root cause (evidence-based: PASS)
1. **Yes, a real limit issue.** The key is valid (raw REST probe → 200). The configured
   model `gemini-3.6-flash` had hit its **free-tier DAILY quota**: verbatim 429 body
   "Generate content requests per day limit exceeded on Free Tier … Please retry in
   19h33m53s", quotaId `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, quotaValue
   20. Free tier ≈ **20 generate requests per day, per model** (plus 10–20/min).
   Occasional 503 "high demand" spikes (provider-side) made it look totally dead.
2. **Plus two bugs in the app's own quota guard** (`src/lib/ai/gemini.ts`) that turned
   a temporary/day-bound problem into a hard failure:
   - `isDailyQuota` misfired on **per-minute** limits: `/PerDay|limit:\s*20/` matched
     any 429 whose body happened to list `limit: 20` (some models' RPM metric) — the
     guard then aborted the whole day while only a minute-window was exhausted.
   - The real daily bodies were **missed**: they say "requests **per day** limit
     exceeded" (spaced form, not `PerDay`) and "Please retry in 19h33m53s" (no
     `retryDelay:` field). Daily aborts got misclassified as retryable → pointless
     retries burned more of the tiny budget.
3. **Model availability for this key (verified via model list + 1-shot probes):**
   alive = `gemini-3-flash-preview`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`
   (200 with fresh daily allowances); `gemini-3.8-flash` 503 high demand;
   all `gemini-2.5-*` **discontinued** (404 "no longer available to new users").

### Fix (without a new API key — PASS)
- `src/lib/ai/gemini.ts`:
  - `AiQuotaError` gains `reason: "daily" | "rate" | "budget"`.
  - Strict daily classification: spaced or camel `per day` wording **excluding**
    per-minute mentions, OR an hours-long retry hint (`parseSloppyRetryHint` parses
    "Please retry in 19h33m53s" → seconds). Per-minute 429s keep retrying in place.
  - Model chain `guarded()`/`streamText` fall through to the next model **only** when
    `reason === "daily"` — every Gemini model has its own separate free daily
    allowance. `FALLBACK_MODELS` = `gemini-3.6-flash` (configured), then
    `gemini-3-flash-preview`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`.
  - Distinct friendly message when every model's day is spent ("resets automatically
    tomorrow") instead of "wait a minute".
- `src/lib/__tests__/gemini-guard.test.ts`: +1 regression test using the **verbatim**
  captured 429 body (spaced "per day" + sloppy retry hint). 14 guard tests total.

### Verification
- `npx tsc --noEmit` clean; `npx vitest run` **144 / 144 PASS**.
- Live pipeline `prisma/_gen-check-live.mts` PASS: with `gemini-3.6-flash`'s day
  spent, the chain logged 5 daily-aborts and served **real AI-generated** quiz
  questions + flashcards from the fallback models (10 requests, 0 retries, 0 local
  fallback batches). The 2026-11-10 "AI-verified NOT YET" item for teacher-style
  generation is now **AI-verified PASS** (quiz questions were conceptual, not
  sentence-block).
- Quota reset confirmed 2026-11-11: raw probe `gemini-3.6-flash` → 200 again (as the
  19h33m prediction said).
- Prod rebuilt (`CI=1 npm run build` green, `.next` re-pinned), single server on :3000.
  `_e2e-playwright.mts` PASS (all routes 200, 0 console errors); `_perf-clicks.mts`
  PASS (warm clicks 108–692 ms; first login after restart 1.8 s, cold start).
- **NOT VERIFIED:** an all-four-models-exhausted-in-one-day full-AI batch (would
  require burning every model's daily budget deliberately); the fallback chain path
  itself is verified instead. `prisma/_quota-autopsy.mts` retained for future probes
  (1 request per model, cheap).
- DB untouched by this fix; no `.env` changes; no new API key needed.

## Date: 2026-11-11 (topic extraction: "Python and miniproject" junk — root cause + fix)

### User complaint
"The topics extracted are `python` and `miniproject` — like what? It should see the
headings/subheadings and extract real topics, for this PDF and every future PDF."

### What actually happened (evidence-based: PASS)
- The real upload was a **screenshot** of an AKTU unit-1 syllabus (note
  `cmwcenh1p0001to5s68uzyv7h`, role=syllabus, sourceKind=image, subject "miniproject").
  OCR was fine — content contains a proper official-syllabus statement:
  "Introduction to Python: Python variables, Python basic Operators, Understanding
  python blocks. Python Data Types, Declaring and using Numeric data types: int, float
  etc."
- The AI refinement call failed at extraction time (provider 503 "high demand" /
  quota pressure logged all day), so extraction fell back to the LOCAL engine —
  and the local engine had three gaps for this document shape:
  1. no chapter map (screenshot text has no page/chapter structure) → legacy path;
  2. the legacy path's local parser (`localSyllabus`) found no headings (the banner
     lines were correctly rejected, the statement line is too long to be a heading)
     and fell through to `keywordTopics` — the most frequent 4+ letter word becomes
     a "concept": **"Python"**;
  3. the fallback chapter was named after the **subject/context**: **"miniproject"**.
- `officialSyllabusTopics()` — a parser written exactly for "Lead: item, item."
  statements — existed but was only wired into the big-document (chapter map) path,
  never into the fallback that actually ran here.

### Fixes (src/lib/ai/syllabus.ts)
1. **Statement engine wired into the fallback.** `officialSyllabusTopics` was refactored
   into a shared statement parser (`parseStatement` + `eachSyllabusStatement`) and a new
   export `statementChapters(source, context)`: every "Lead: item, item, item."
   statement becomes a chapter named by its lead, with the comma-separated items as
   its real topics. `localSyllabus` now tries statements BEFORE the keyword fallback.
2. **Banner-glued leads handled.** "PYTHON PROGRAMMING AKTU SYLLABUS UNIT-1
   Introduction to Python: …" → banner words are stripped from the lead (only while
   fully-capitalised and ≥2 words remain, so legitimate all-caps leads are safe);
   standalone "Unit-1"-style leads normalise to "Unit 1".
3. **Local result is the baseline, AI merges on top.** The legacy `extractSyllabus`
   path previously returned the AI answer *alone* — a thin AI response (it returned
   only 2 of 5 topics on the real content) silently discarded the deterministic
   statement topics. Now the local tree is the floor, AI chapters merge in, and
   `dedupeAcrossChapters` collapses names that appear both as a chapter and as a
   topic (e.g. "Introduction to Python") so nothing is stored twice.

### Verification
- Regression tests (verbatim real content + glued-banner + unit-lead variants):
  `npx vitest run` **147 / 147 PASS**; `npx tsc --noEmit` clean.
- Live re-extraction of the exact note content: chapter "Introduction to Python" with
  Python variables / Python basic Operators / Understanding python blocks / Python
  Data Types / Declaring and using Numeric data types. **PASS** (this run also had the
  AI fall over mid-call again — the deterministic engine still produced the full tree).
- **User data repaired (PASS):** junk topics "miniproject" + "Python" removed (the
  keyword topic had a practice quiz attached with 1 attempt — the quiz was re-pointed
  to the real "Introduction to Python" chapter; attempt + 10 questions preserved; one
  intermediate cascade noted in `prisma/_fix-user-topics.mts`, quiz.topicId is
  SetNull so nothing was lost). Final subject tree = the clean 5-topic chapter,
  unapproved, ready for the student's review/approval as designed.
- Prod rebuilt (`CI=1 npm run build` green, `.next` re-pinned), single server on :3000.
  `_e2e-playwright.mts` PASS (all routes 200, 0 console errors, 0 AI calls).
  `_perf-clicks.mts`: warm clicks roadmap 443 ms / subjects 192 ms / notes 206 ms /
  analytics 237 ms / subject page 830 ms (first login after restart 2.2 s, cold
  caches + OneDrive hydration; settles to baseline).
- Probe scripts kept: `prisma/_repro-extract.mts` (offline repro),
  `prisma/_verify-extract-live.mts` (live e2e extraction check),
  `prisma/_fix-user-topics.mts` (the data-repair record).
- **NOT VERIFIED:** a multi-unit full-syllabus screenshot end-to-end in the app UI
  (the statement engine handles multiple statements — budget 8 chapters — but only
  single-unit material was available to test live); the 54-page "python unit 1" PDF
  is a notes-role document and intentionally does not touch the syllabus.
- DB: only the user's own miniproject-subject topics were touched (as complained
  about); reserved exam `cmw6avxig000ftocov75f1cvw` untouched.

## Date: 2026-11-12 (demo handover: account reset + Try demo)

### Request
Delete the user's own account/data, keep + polish the demo account as a showcase,
and have a "Try demo" option on the login page that opens it. AI features untouched.

### Done (PASS)
1. **Backup first:** consistent SQLite copy via `VACUUM INTO` →
   `prisma/dev_backup_20261112_demo-handover_21053f.db` (all prior backups retained).
2. **Account deletion:** the user's own account
   (`ishitaprajapati1803@gmail.com`, incl. the reserved Python exam and every
   subject/note/quiz) and the leftover `e2e-check@studymaster.app` fixture user were
   deleted via Prisma cascade. Users 3 → 1: **only `demo@studymaster.app` remains.**
3. **Demo showcase enrichment** (data only, no AI/logic changes):
   - Upcoming exams got topic selections (Biology exam, Chemistry mock test,
     Chemistry exam → 9 examTopics with easy/medium/hard ratings), so the exam
     planner, capacity banner and countdown render real content.
   - Roadmap plan rebuilt from today via the app's own `generatePlanForUser`
     (deterministic, no AI).
   - Presence fields refreshed (`lastActiveDate` = today).
   - Inventory: 4 subjects, 16 topics (approved, varied statuses), 5 notes,
     5 exams, 9 exam-topic selections, 3 quizzes with attempts, 14 flashcards with
     review history, goals, XP + 10 achievements.
4. **Login page:** the demo button (existing NextAuth credentials flow) was
   relabelled to **"Try demo"** with an explanatory hint card. One-click sign-in to
   the demo account. `demo@studymaster.app / demo1234` unchanged.
5. **Gates:** `npx tsc --noEmit` clean; `npx vitest run` **147/147 PASS**;
   `CI=1 npm run build` green; `.next` re-pinned; single prod server on :3000.
   `_e2e-playwright.mts` PASS (demo login OK, all routes 200, 0 console errors,
   0 AI calls; /login verified to render the "Try demo" button). `_perf-clicks.mts`
   warm: roadmap 492 ms, subjects 191 ms, notes 146 ms, analytics 381 ms
   (first login after restart 2.1 s, cold caches).
- AI quiz/flashcard generation and topic extraction logic: **unchanged** by request.
- Record scripts kept: `prisma/_demo-handover.mts` (backup + deletion + enrichment).

