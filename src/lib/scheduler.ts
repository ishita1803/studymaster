import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";

export type SchedulerTopic = {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectColor: string;
  name: string;
  difficulty: number;
  importance: number;
  estimatedMinutes: number;
  completedMinutes: number;
  /** YYYY-MM-DD of the nearest test that selects this topic, or null. */
  examDate: string | null;
  /** The test that currently owns this topic. */
  examId?: string | null;
  status: string;
  masteryScore: number;
  weak?: boolean;
  /** Subject/test difficulty, 1 (easy) – 5 (very difficult). */
  subjectDifficulty?: number;
  /** beginner | intermediate | advanced */
  prepLevel?: string;
  /** Importance of the nearest test for this subject. */
  examImportance?: number;
  /** Number of approved topics in the shared subject syllabus. */
  syllabusTotal?: number;
  /** Approved topics that are already studied/revised/mastered. */
  syllabusCompleted?: number;
  /** Recent quiz accuracy for this topic, 0–100. Null when never attempted. */
  quizAccuracy?: number | null;
};

export type PriorityBreakdown = {
  score: number;
  daysToExam: number | null;
  urgency: number;
  topicDifficulty: number;
  subjectDifficulty: number;
  importance: number;
  incomplete: number;
  prepPressure: number;
  quizPressure: number;
  effortPressure: number;
  reasons: string[];
};

export type SchedulerOptions = {
  startDate: Date;
  dailyMinutes: number;
  horizonDays?: number;
  /** Local minute-of-day for the first block, e.g. 18 * 60 for 6pm. */
  dayStartMinute?: number;
};

export type ScheduledKind = "study" | "revision" | "quiz";

/**
 * Minimal per-(topic × exam) input needed by the capacity analysis. `plan-service`
 * builds these with the exact same exam-selection and rating-weighting rules it
 * feeds to `buildPlan`, so the two never drift apart.
 */
export type CapacityTopic = {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectColor: string;
  estimatedMinutes: number;
  completedMinutes: number;
  examDate: string;
  examId: string;
  status: string;
};

export type CapacityShortfall = {
  examId: string;
  subjectId: string;
  subjectName: string;
  subjectColor: string;
  examDate: string;
  /** Days from the plan's start date to the exam (0 = today). */
  examInDays: number;
  /** How much study material is still open for this test's topics (minutes). */
  requiredMinutes: number;
  /** Days available for NEW material before the reserved revision window. */
  studyDays: number;
  /** studyDays × daily budget after the per-day revision/quiz maintenance reserve. */
  availableMinutes: number;
  /** How many minutes of material will not fit at the current daily hours. */
  shortfallMinutes: number;
};

export type ScheduledItem = {
  date: string;
  topicId: string;
  subjectId: string;
  subjectName: string;
  subjectColor: string;
  topicName: string;
  kind: ScheduledKind;
  /** Local start time, e.g. "18:25". */
  startTime: string;
  minutes: number;
  order: number;
  priority: number;
  reason: string;
};

/** Smallest useful study block. Anything shorter becomes noise. */
const MIN_STUDY_BLOCK = 20;
/** Longest single study block before we rotate to another topic. */
const MAX_STUDY_BLOCK = 45;
const REVISION_BLOCK = 25;
const QUIZ_BLOCK = 20;
const MAX_REVISION_PER_DAY = 3;
const MAX_QUIZ_PER_DAY = 2;
const BREAK_BETWEEN_BLOCKS = 5;
const REVISION_MIN_DAYS = 2;
const REVISION_MAX_DAYS = 5;
/** Maintenance quizzes appear roughly every third day, not only before exams. */
const MAINTENANCE_QUIZ_EVERY = 3;

const KIND_ORDER: Record<ScheduledKind, number> = {
  study: 0,
  revision: 1,
  quiz: 2,
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function parseKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function keyOf(date: Date) {
  return format(date, "yyyy-MM-dd");
}

/** "HH:mm" for a local minute-of-day, wrapping safely past midnight. */
export function minuteToClock(minute: number) {
  const normalized = ((Math.round(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(
    normalized % 60,
  ).padStart(2, "0")}`;
}

/** Parses "HH:mm" into a minute-of-day. Falls back to 6pm. */
export function clockToMinute(clock: string | null | undefined) {
  if (!clock) return 18 * 60;
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!match) return 18 * 60;
  const hours = clamp(Number(match[1]), 0, 23);
  const minutes = clamp(Number(match[2]), 0, 59);
  return hours * 60 + minutes;
}

/**
 * Maps the 1–5 difficulty scale to the labels students choose in the UI.
 */
export function difficultyLabel(value: number | undefined) {
  if ((value ?? 3) >= 5) return "Very difficult";
  if ((value ?? 3) >= 4) return "Difficult";
  if ((value ?? 3) >= 3) return "Moderate";
  return "Easy";
}

function prepPressure(prepLevel: string | undefined) {
  if (prepLevel === "beginner") return 1;
  if (prepLevel === "advanced") return 0.15;
  return 0.55;
}

function examUrgency(daysToExam: number) {
  const days = Math.max(0, daysToExam);
  // Proximity dominates: a test this week is always urgent, while a test two
  // months away still contributes a small baseline pressure.
  const proximity =
    days <= 1 ? 1 : days <= 3 ? 0.95 : days <= 7 ? 0.85 : days <= 14 ? 0.65 : days <= 30 ? 0.42 : 0.2;
  const horizon = clamp(1 - days / 60, 0, 1);
  return clamp(proximity * 0.65 + horizon * 0.35, 0, 1);
}

/**
 * Explainable, deterministic priority. Every weight is visible so the roadmap
 * can tell the student *why* a topic was chosen:
 *
 *   urgency 30% · topic difficulty 18% · subject difficulty 10% ·
 *   importance 9% · exam importance 5% · syllabus incompleteness 10% ·
 *   preparation level 8% · quiz performance 6% · remaining effort 4%
 *
 * Weak topics get a 15% boost and mastered topics are de-prioritised.
 */
export function topicPriorityBreakdown(topic: SchedulerTopic, date: Date): PriorityBreakdown {
  const daysToExam = topic.examDate
    ? differenceInCalendarDays(parseKey(topic.examDate), date)
    : null;
  const effectiveDays = daysToExam ?? 45;
  const urgency = examUrgency(effectiveDays);
  const topicDifficulty = clamp(topic.difficulty / 5, 0, 1);
  const subjectDifficulty = clamp((topic.subjectDifficulty ?? topic.difficulty) / 5, 0, 1);
  const importance = clamp(topic.importance / 5, 0, 1);
  const examImportance = clamp((topic.examImportance ?? topic.importance) / 5, 0, 1);

  const total = Math.max(0, topic.syllabusTotal ?? 0);
  const done = Math.min(total, Math.max(0, topic.syllabusCompleted ?? 0));
  const syllabusRatio =
    total > 0 ? done / total : isAlreadyLearned(topic) ? 0.6 : 0;
  const incomplete = clamp(1 - syllabusRatio, 0, 1);

  const prep = prepPressure(topic.prepLevel);
  const quizPressure =
    topic.quizAccuracy == null ? 0.5 : clamp(1 - topic.quizAccuracy / 100, 0, 1);
  const remaining = Math.max(0, topic.estimatedMinutes - topic.completedMinutes);
  const effortPressure = clamp(remaining / 240, 0, 1);

  let score =
    0.3 * urgency +
    0.18 * topicDifficulty +
    0.1 * subjectDifficulty +
    0.09 * importance +
    0.05 * examImportance +
    0.1 * incomplete +
    0.08 * prep +
    0.06 * quizPressure +
    0.04 * effortPressure;

  if (topic.weak) score *= 1.15;
  if (topic.masteryScore >= 80) score *= 0.65;

  const reasons: string[] = [];
  if (daysToExam !== null) {
    reasons.push(
      daysToExam <= 0
        ? "Exam today"
        : `Exam in ${daysToExam} day${daysToExam === 1 ? "" : "s"}`,
    );
  }
  if (subjectDifficulty >= 0.6) reasons.push(difficultyLabel(topic.subjectDifficulty));
  if (incomplete >= 0.25) {
    reasons.push(`${Math.round(incomplete * 100)}% syllabus incomplete`);
  }
  if (topic.prepLevel === "beginner") reasons.push("Beginner preparation");
  if (topic.weak) reasons.push("Weak quiz performance");
  else if (topic.quizAccuracy != null && topic.quizAccuracy < 60) {
    reasons.push(`Quiz accuracy ${Math.round(topic.quizAccuracy)}%`);
  }
  if (reasons.length === 0) {
    reasons.push(remaining > 0 ? "Steady progress" : "Keep it fresh");
  }

  return {
    score: Math.round(score * 100) / 100,
    daysToExam,
    urgency,
    topicDifficulty,
    subjectDifficulty,
    importance,
    incomplete,
    prepPressure: prep,
    quizPressure,
    effortPressure,
    reasons: reasons.slice(0, 4),
  };
}

/**
 * Priority blend used by the scheduler. Kept as a small wrapper so existing
 * callers and tests keep working while the explainable breakdown is available.
 */
export function topicPriority(topic: SchedulerTopic, date: Date) {
  return topicPriorityBreakdown(topic, date).score;
}

/** How many days before an exam should be kept free of new material. */
export function revisionWindowDays(daysToExam: number) {
  if (daysToExam <= 0) return 0;
  return clamp(Math.ceil(daysToExam * 0.2), REVISION_MIN_DAYS, REVISION_MAX_DAYS);
}

/**
 * One track = one test + the topics it selects. A subject with several tests
 * therefore gets several tracks, each with its own deadline and topic set.
 */
type SubjectMeta = {
  /** Stable key: subjectId + exam date. */
  trackKey: string;
  id: string;
  name: string;
  color: string;
  exam: Date;
  examId: string | null;
  revisionStart: Date | null;
  revisionDays: number;
  studyEnd: Date | null;
  studyDays: number;
  total: number;
  scheduled: number;
  estimatedTotal: number;
  completedTotal: number;
  difficulty: number;
  prepLevel: string;
  examImportance: number;
  syllabusTotal: number;
  syllabusCompleted: number;
  priority: number;
  topics: SchedulerTopic[];
  revisionPool: SchedulerTopic[];
  quizDays: Set<string>;
};

function isAlreadyLearned(topic: SchedulerTopic) {
  return (
    topic.completedMinutes > 0 ||
    ["studied", "revised", "mastered"].includes(topic.status)
  );
}

function isExamPassed(meta: SubjectMeta, date: Date) {
  return Boolean(meta.exam && differenceInCalendarDays(meta.exam, date) < 0);
}

/**
 * Builds a day-by-day study plan.
 *
 * Rules:
 * - Exams are planned strictly one after another, the way a student actually
 *   prepares: every day before the next exam belongs to that exam's topics
 *   only. Work for a later exam begins the day after the earlier exam's
 *   date — with exams 5/10/15 days out, the first 5 days contain only exam
 *   1's topics, then exam 2's, then exam 3's, never mixed. At least the last
 *   2 days before an exam contain only that exam's topics.
 * - Revision never happens before study: a topic only becomes revisable the
 *   day after it received its first study block. Unstudied topics get real
 *   study blocks, never "revision" relabelled.
 * - Every day in the runway gets work: new material is paced against a linear
 *   target, and once it is exhausted the day is filled with spaced revision and
 *   practice quizzes. There are no unexplained empty days.
 * - The final ~20% of the runway before each exam (2–5 days) is reserved for
 *   revision and practice quizzes of already-studied topics. If an exam's
 *   material was never studied, those days carry honest study blocks for it
 *   instead — and `capacityShortfalls` separately tells the student to
 *   increase their daily hours rather than compressing blocks.
 * - Never schedules a subject after its exam date.
 * - Shares one daily minute budget across every subject and every block kind.
 * - Gives every block a local start time so the roadmap can show when it happens.
 */
export function buildPlan(topics: SchedulerTopic[], options: SchedulerOptions): ScheduledItem[] {
  if (topics.length === 0) return [];

  const start = startOfDay(options.startDate);
  const daily = Math.max(30, Math.round(options.dailyMinutes));
  const dayStartMinute = options.dayStartMinute ?? 18 * 60;

  // Subjects are study containers. A topic only becomes roadmap work once a
  // dated test selects it, so topics without an exam are ignored entirely.
  const schedulableTopics = topics.filter(
    (topic): topic is SchedulerTopic & { examDate: string } => Boolean(topic.examDate),
  );
  if (schedulableTopics.length === 0) return [];

  const examOffsets = schedulableTopics
    .map((topic) => differenceInCalendarDays(parseKey(topic.examDate), start))
    .filter((offset) => offset >= 0);

  // The plan runs from today through the last upcoming test, not just the first.
  if (examOffsets.length === 0) return [];
  const furthestExam = Math.max(...examOffsets);
  // The plan must cover the whole runway through the furthest exam — no
  // arbitrary 14/180-day cut that would strand later exams.
  const horizon = options.horizonDays ?? clamp(furthestExam + 1, 1, 500);
  const horizonEnd = addDays(start, horizon - 1);

  const remaining = new Map<string, number>(
    schedulableTopics.map((t) => [
      t.id,
      Math.max(0, t.estimatedMinutes - t.completedMinutes),
    ]),
  );

  // When a topic was (or will be) first studied. Topics already in progress are
  // available for revision from day one; new topics become revisable the day
  // after their first study block.
  const studiedOn = new Map<string, Date>();
  for (const topic of schedulableTopics) {
    if (isAlreadyLearned(topic)) studiedOn.set(topic.id, addDays(start, -1));
  }

  const subjects = new Map<string, SubjectMeta>();
  for (const topic of schedulableTopics) {
    const exam = parseKey(topic.examDate);
    // One track per test. Topics from two different tests of the same subject
    // must not be merged, because each test has its own deadline and set.
    const trackKey = topic.examId
      ? `exam:${topic.examId}`
      : `subject:${topic.subjectId}:${keyOf(exam)}`;

    let meta = subjects.get(trackKey);
    if (!meta) {
      meta = {
        trackKey,
        id: topic.subjectId,
        name: topic.subjectName,
        color: topic.subjectColor,
        exam,
        examId: topic.examId ?? null,
        revisionStart: null,
        revisionDays: 0,
        studyEnd: null,
        studyDays: 0,
        total: 0,
        scheduled: 0,
        estimatedTotal: 0,
        completedTotal: 0,
        difficulty: topic.subjectDifficulty ?? topic.difficulty,
        prepLevel: topic.prepLevel ?? "intermediate",
        examImportance: topic.examImportance ?? topic.importance,
        syllabusTotal: topic.syllabusTotal ?? 0,
        syllabusCompleted: topic.syllabusCompleted ?? 0,
        priority: 0,
        topics: [],
        revisionPool: [],
        quizDays: new Set(),
      };
      subjects.set(trackKey, meta);
    }
    meta.topics.push(topic);
  }

  for (const meta of subjects.values()) {
    const daysToExam = differenceInCalendarDays(meta.exam, start);

    if (daysToExam < 0) {
      // Exam already passed: this track is done.
      meta.studyEnd = null;
      meta.revisionStart = null;
      meta.revisionDays = 0;
    } else if (daysToExam === 0) {
      // Exam today: final revision only.
      meta.studyEnd = null;
      meta.revisionStart = start;
      meta.revisionDays = 1;
    } else {
      const revisionDays = revisionWindowDays(daysToExam);
      meta.revisionDays = revisionDays;
      meta.revisionStart = addDays(meta.exam, -revisionDays);
      if (meta.revisionStart < start) meta.revisionStart = start;
      meta.studyEnd = addDays(meta.revisionStart, -1);
    }

    if (meta.studyEnd && meta.studyEnd > horizonEnd) meta.studyEnd = horizonEnd;
    if (meta.studyEnd && meta.studyEnd < start) meta.studyEnd = null;

    meta.studyDays = meta.studyEnd
      ? Math.max(0, differenceInCalendarDays(meta.studyEnd, start) + 1)
      : 0;

    meta.total = meta.topics.reduce(
      (sum, topic) =>
        topic.status === "mastered"
          ? sum
          : sum + Math.max(0, topic.estimatedMinutes - topic.completedMinutes),
      0,
    );

    meta.estimatedTotal = meta.topics.reduce(
      (sum, topic) => sum + Math.max(0, topic.estimatedMinutes),
      0,
    );
    meta.completedTotal = meta.topics.reduce(
      (sum, topic) =>
        sum +
        Math.min(
          Math.max(0, topic.estimatedMinutes),
          Math.max(0, topic.completedMinutes),
        ),
      0,
    );

    // Subject-level pressure: urgency + difficulty + exam importance +
    // remaining syllabus. This is what lets a very difficult exam next week
    // outrank an easy test tomorrow without ignoring either.
    const urgency = examUrgency(daysToExam);
    const difficulty = clamp(meta.difficulty / 5, 0, 1);
    const examImportance = clamp(meta.examImportance / 5, 0, 1);
    const incompleteness =
      meta.estimatedTotal > 0
        ? clamp(1 - meta.completedTotal / meta.estimatedTotal, 0, 1)
        : 1;
    meta.priority =
      0.42 * urgency +
      0.2 * difficulty +
      0.1 * examImportance +
      0.13 * incompleteness +
      0.15 * prepPressure(meta.prepLevel);

    const unmastered = meta.topics.filter(
      (topic) => topic.status !== "mastered" || topic.masteryScore < 85,
    );
    meta.revisionPool = unmastered.length > 0 ? unmastered : meta.topics;

    if (meta.revisionStart && meta.revisionDays > 0) {
      const firstQuiz = addDays(meta.revisionStart, 1);
      const lastQuiz = addDays(meta.exam, -1);
      if (meta.revisionDays >= 3) {
        meta.quizDays.add(keyOf(firstQuiz));
        meta.quizDays.add(keyOf(lastQuiz));
      } else {
        meta.quizDays.add(keyOf(meta.revisionStart));
      }
    }
  }

  // Highest-pressure subjects get first claim on each day's shared budget.
  // The subject score blends urgency, difficulty, exam importance, remaining
  // syllabus and preparation level, so later-but-harder exams still get time.
  const subjectList = [...subjects.values()].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const ea = a.exam.getTime();
    const eb = b.exam.getTime();
    if (ea !== eb) return ea - eb;
    return a.name.localeCompare(b.name);
  });

  const items: ScheduledItem[] = [];
  const lastRevised = new Map<string, Date>();
  const lastQuizzed = new Map<string, Date>();

  /**
   * Which tests may be studied on a given day — strictly sequential, the way
   * a student actually prepares:
   *
   * - Tests that already happened never get work.
   * - Every day before the next exam belongs to that exam's topics only.
   * - Work for a later exam begins the day after the earlier exam's date, so
   *   with exams 5/10/15 days out the first 5 days contain only exam 1's
   *   topics, then exam 2's, then exam 3's — never mixed.
   * - Exams happening on the same nearest date share the day (usually one).
   */
  function activeTracks(date: Date): SubjectMeta[] {
    const upcoming = subjectList.filter(
      (meta) => differenceInCalendarDays(meta.exam, date) >= 0,
    );
    if (upcoming.length === 0) return [];

    const nearest = Math.min(
      ...upcoming.map((meta) => differenceInCalendarDays(meta.exam, date)),
    );
    return upcoming.filter(
      (meta) => differenceInCalendarDays(meta.exam, date) === nearest,
    );
  }

  function revisionCandidates(date: Date, meta: SubjectMeta | null) {
    const pool = meta ? meta.revisionPool : subjectList.flatMap((entry) => entry.revisionPool);
    return pool
      .filter((topic) => {
        if (meta && isExamPassed(meta, date)) return false;
        const learned = studiedOn.has(topic.id) && (studiedOn.get(topic.id)?.getTime() ?? 0) < date.getTime();
        return learned;
      })
      .sort((a, b) => {
        const recentA = lastRevised.get(a.id);
        const recentB = lastRevised.get(b.id);
        const aCooling = recentA ? differenceInCalendarDays(date, recentA) < 1 : false;
        const bCooling = recentB ? differenceInCalendarDays(date, recentB) < 1 : false;
        if (aCooling !== bCooling) return aCooling ? 1 : -1;
        const aTime = recentA?.getTime() ?? 0;
        const bTime = recentB?.getTime() ?? 0;
        if (aTime !== bTime) return aTime - bTime;
        if (a.weak !== b.weak) return a.weak ? -1 : 1;
        if (a.masteryScore !== b.masteryScore) return a.masteryScore - b.masteryScore;
        return topicPriority(b, date) - topicPriority(a, date);
      });
  }

  function quizCandidates(date: Date, meta: SubjectMeta | null) {
    return revisionCandidates(date, meta)
      .filter((topic) => {
        const last = lastQuizzed.get(topic.id);
        return !last || differenceInCalendarDays(date, last) >= 2;
      })
      .sort((a, b) => {
        const recentA = lastQuizzed.get(a.id);
        const recentB = lastQuizzed.get(b.id);
        const aTime = recentA?.getTime() ?? 0;
        const bTime = recentB?.getTime() ?? 0;
        if (aTime !== bTime) return aTime - bTime;
        return a.masteryScore - b.masteryScore;
      });
  }

  for (let dayIndex = 0; dayIndex < horizon; dayIndex++) {
    const date = addDays(start, dayIndex);
    const key = keyOf(date);
    let capacity = daily;
    const dayItems: ScheduledItem[] = [];
    let revisionBlocksToday = 0;
    let quizBlocksToday = 0;
    const studiedToday = new Set<string>();
    const dayTracks = activeTracks(date);

    // ---------------------------------------------------------- new material
    const activeNew = dayTracks.filter((meta) => {
      if (!meta.studyEnd || meta.total <= 0 || meta.studyDays <= 0) return false;
      if (date > meta.studyEnd) return false;
      if (isExamPassed(meta, date)) return false;
      const elapsed = differenceInCalendarDays(date, start);
      if (elapsed >= meta.studyDays) return false;
      return meta.total - meta.scheduled > 0;
    });
    // Same-day exams share the day, so reserve a fair share for each — a very
    // urgent exam cannot consume the whole day and starve the other exam on
    // the same date. Across different dates the plan is sequential, so this
    // only ever splits exams happening on the identical nearest date.
    const minShare =
      activeNew.length > 1
        ? clamp(Math.floor(daily / activeNew.length), MIN_STUDY_BLOCK, MAX_STUDY_BLOCK)
        : MIN_STUDY_BLOCK;

    for (let subjectIndex = 0; subjectIndex < activeNew.length; subjectIndex++) {
      const meta = activeNew[subjectIndex];
      const remainingForSubject = meta.total - meta.scheduled;
      if (remainingForSubject <= 0) continue;

      const elapsed = differenceInCalendarDays(date, start);
      const studyDaysLeft = meta.studyDays - elapsed;
      const target = Math.ceil(remainingForSubject / Math.max(1, studyDaysLeft));

      const subjectsAfter = activeNew.length - subjectIndex - 1;
      const reservedForOthers = Math.min(capacity, subjectsAfter * minShare);
      const available = Math.max(0, capacity - reservedForOthers);
      if (available < 10) continue;

      // Always give the subject a real block, even when the linear target is
      // tiny. A 20-minute start beats an empty "open day" in the roadmap.
      const desired = Math.min(
        available,
        Math.max(Math.min(minShare, remainingForSubject), target),
      );
      if (desired < 10) continue;

      let budget = Math.min(desired, available, remainingForSubject);

      while (budget >= 10 && capacity >= 10) {
        const candidates = meta.topics
          .filter(
            (topic) =>
              topic.status !== "mastered" && (remaining.get(topic.id) ?? 0) >= 10,
          )
          .sort((a, b) => {
            const studiedA = studiedToday.has(a.id) ? 1 : 0;
            const studiedB = studiedToday.has(b.id) ? 1 : 0;
            if (studiedA !== studiedB) return studiedA - studiedB;
            const priority = topicPriority(b, date) - topicPriority(a, date);
            if (priority !== 0) return priority;
            return (remaining.get(b.id) ?? 0) - (remaining.get(a.id) ?? 0);
          });

        if (candidates.length === 0) break;
        const topic = candidates[0];
        const left = remaining.get(topic.id) ?? 0;
        const chunk = Math.min(left, MAX_STUDY_BLOCK, budget, capacity);
        if (chunk < 10) break;

        const breakdown = topicPriorityBreakdown(topic, date);

        dayItems.push({
          date: key,
          topicId: topic.id,
          subjectId: meta.id,
          subjectName: meta.name,
          subjectColor: meta.color,
          topicName: topic.name,
          kind: "study",
          startTime: "",
          minutes: chunk,
          order: 0,
          priority: breakdown.score,
          reason: breakdown.reasons.join(" · "),
        });

        remaining.set(topic.id, left - chunk);
        meta.scheduled += chunk;
        budget -= chunk;
        capacity -= chunk;
        studiedToday.add(topic.id);
        if (!studiedOn.has(topic.id)) studiedOn.set(topic.id, date);
      }
    }

    // ------------------------------------- spaced revision during the runway
    // This is what fills the days after new material is exhausted. It keeps
    // recall active without waiting for the final exam-week revision window.
    for (const meta of dayTracks) {
      if (capacity < 10 || revisionBlocksToday >= MAX_REVISION_PER_DAY) break;
      if (isExamPassed(meta, date)) continue;
      if (meta.revisionStart && date >= meta.revisionStart) continue;

      const candidates = revisionCandidates(date, meta).filter(
        (topic) => !studiedToday.has(topic.id),
      );

      for (const topic of candidates) {
        if (capacity < 10 || revisionBlocksToday >= MAX_REVISION_PER_DAY) break;
        const last = lastRevised.get(topic.id);
        if (last && differenceInCalendarDays(date, last) < 1) continue;

        const minutes = Math.min(REVISION_BLOCK, capacity);
        dayItems.push({
          date: key,
          topicId: topic.id,
          subjectId: meta.id,
          subjectName: meta.name,
          subjectColor: meta.color,
          topicName: topic.name,
          kind: "revision",
          startTime: "",
          minutes,
          order: 0,
          priority: Math.round((topicPriority(topic, date) + 0.15) * 100) / 100,
          reason: "Spaced revision · keep it fresh",
        });
        lastRevised.set(topic.id, date);
        capacity -= minutes;
        revisionBlocksToday++;
      }
    }

    // -------------------------------- practice quizzes throughout the plan
    const maintenanceQuizDay =
      dayIndex > 0 &&
      (dayIndex % MAINTENANCE_QUIZ_EVERY === MAINTENANCE_QUIZ_EVERY - 1 ||
        capacity >= daily * 0.5);
    if (maintenanceQuizDay && capacity >= QUIZ_BLOCK && quizBlocksToday < MAX_QUIZ_PER_DAY) {
      for (const meta of dayTracks) {
        if (capacity < QUIZ_BLOCK || quizBlocksToday >= MAX_QUIZ_PER_DAY) break;
        if (isExamPassed(meta, date)) continue;
        if (meta.revisionStart && date >= meta.revisionStart) continue;

        const candidates = quizCandidates(date, meta).filter(
          (topic) => !studiedToday.has(topic.id),
        );
        const topic = candidates[0];
        if (!topic) continue;

        const daysToExam = meta.exam ? differenceInCalendarDays(meta.exam, date) : null;
        dayItems.push({
          date: key,
          topicId: topic.id,
          subjectId: meta.id,
          subjectName: meta.name,
          subjectColor: meta.color,
          topicName: topic.name,
          kind: "quiz",
          startTime: "",
          minutes: QUIZ_BLOCK,
          order: 0,
          priority: Math.round((topicPriority(topic, date) + 0.2) * 100) / 100,
          reason:
            daysToExam !== null
              ? `Practice quiz · exam in ${daysToExam} day${daysToExam === 1 ? "" : "s"}`
              : "Practice quiz · check your recall",
        });
        lastQuizzed.set(topic.id, date);
        capacity -= QUIZ_BLOCK;
        quizBlocksToday++;
      }
    }

    // ------------------------------------------------- revision and quizzes
    for (let trackIndex = 0; trackIndex < dayTracks.length; trackIndex++) {
      const meta = dayTracks[trackIndex];
      if (!meta.exam || !meta.revisionStart) continue;
      if (date < meta.revisionStart || date > meta.exam) continue;
      if (isExamPassed(meta, date)) continue;
      if (capacity < 10) break;

      const daysToExam = differenceInCalendarDays(meta.exam, date);
      const examReason =
        daysToExam <= 0
          ? "Final revision · exam today"
          : `Revision window · exam in ${daysToExam} day${daysToExam === 1 ? "" : "s"}`;

      // A quiz on selected revision days, before the revision blocks.
      if (
        meta.quizDays.has(key) &&
        capacity >= QUIZ_BLOCK &&
        quizBlocksToday < MAX_QUIZ_PER_DAY
      ) {
        const topic =
          quizCandidates(date, meta)[0] ?? revisionCandidates(date, meta)[0];
        if (topic) {
          const minutes = Math.min(QUIZ_BLOCK, capacity);
          dayItems.push({
            date: key,
            topicId: topic.id,
            subjectId: meta.id,
            subjectName: meta.name,
            subjectColor: meta.color,
            topicName: topic.name,
            kind: "quiz",
            startTime: "",
            minutes,
            order: 0,
            priority: Math.round((topicPriority(topic, date) + 0.2) * 100) / 100,
            reason:
              daysToExam <= 0
                ? "Practice quiz · exam today"
                : `Practice quiz · exam in ${daysToExam} day${daysToExam === 1 ? "" : "s"}`,
          });
          lastQuizzed.set(topic.id, date);
          capacity -= minutes;
          quizBlocksToday++;
        }
      }

      // Revision blocks, spaced at least one day apart per topic. Topics that
      // have waited longest go first, so every topic gets covered before any
      // single topic is revised twice. Only topics that were actually studied
      // qualify — a topic that never got study time is not "revised" here.
      const candidates = revisionCandidates(date, meta);

      for (const topic of candidates) {
        if (capacity < 10 || revisionBlocksToday >= MAX_REVISION_PER_DAY) break;
        const last = lastRevised.get(topic.id);
        if (last && differenceInCalendarDays(date, last) < 1) continue;

        const minutes = Math.min(REVISION_BLOCK, capacity);
        dayItems.push({
          date: key,
          topicId: topic.id,
          subjectId: meta.id,
          subjectName: meta.name,
          subjectColor: meta.color,
          topicName: topic.name,
          kind: "revision",
          startTime: "",
          minutes,
          order: 0,
          priority: Math.round((topicPriority(topic, date) + 0.15) * 100) / 100,
          reason: examReason,
        });
        lastRevised.set(topic.id, date);
        capacity -= minutes;
        revisionBlocksToday++;
      }

      // An unstudied topic still needs its first real study time. With exam
      // days left and material untouched, a student studies it now — honest
      // study blocks at the normal block size, never "revision" relabelled
      // and never squeezed into tiny minutes. `capacityShortfalls` separately
      // tells the student to increase their daily hours when the material
      // cannot fit before the exam.
      const remainingForExam = meta.total - meta.scheduled;
      // Same-day exams share the day here too: reserve a real share for the
      // sibling exams so the first track cannot cram away the whole evening.
      const siblingsAfter = Math.max(0, dayTracks.length - trackIndex - 1);
      const fairShare = clamp(
        Math.floor(daily / dayTracks.length),
        MIN_STUDY_BLOCK,
        MAX_STUDY_BLOCK,
      );
      const reservedForOthers = Math.min(capacity, siblingsAfter * fairShare);
      const cramCapacity = capacity - reservedForOthers;
      if (remainingForExam >= MIN_STUDY_BLOCK && cramCapacity >= MIN_STUDY_BLOCK) {
        let budget = Math.min(remainingForExam, cramCapacity);
        while (budget >= MIN_STUDY_BLOCK && capacity >= MIN_STUDY_BLOCK) {
          const studyCandidates = meta.topics
            .filter(
              (topic) =>
                topic.status !== "mastered" &&
                (remaining.get(topic.id) ?? 0) >= MIN_STUDY_BLOCK,
            )
            .sort((a, b) => {
              const priority = topicPriority(b, date) - topicPriority(a, date);
              if (priority !== 0) return priority;
              return (remaining.get(b.id) ?? 0) - (remaining.get(a.id) ?? 0);
            });
          if (studyCandidates.length === 0) break;
          const topic = studyCandidates[0];
          const left = remaining.get(topic.id) ?? 0;
          const chunk = Math.min(left, MAX_STUDY_BLOCK, budget, capacity);
          if (chunk < MIN_STUDY_BLOCK) break;

          const breakdown = topicPriorityBreakdown(topic, date);
          dayItems.push({
            date: key,
            topicId: topic.id,
            subjectId: meta.id,
            subjectName: meta.name,
            subjectColor: meta.color,
            topicName: topic.name,
            kind: "study",
            startTime: "",
            minutes: chunk,
            order: 0,
            priority: breakdown.score,
            reason:
              daysToExam <= 0
                ? "Exam today · still needs study"
                : `Final window · not studied yet · exam in ${daysToExam} day${
                    daysToExam === 1 ? "" : "s"
                  }`,
          });
          remaining.set(topic.id, left - chunk);
          meta.scheduled += chunk;
          budget -= chunk;
          capacity -= chunk;
          studiedToday.add(topic.id);
          if (!studiedOn.has(topic.id)) studiedOn.set(topic.id, date);
        }
      }
    }

    // ---------------------------------------------------- never leave a gap
    // If a day is still empty but there is learned material to revisit, add one
    // useful block. The user should always know what to do when they open the
    // roadmap, even on a light day.
    if (dayItems.length === 0 && capacity >= 10) {
      const fallback = dayTracks
        .filter((meta) => !isExamPassed(meta, date))
        .flatMap((meta) =>
          revisionCandidates(date, meta).map((topic) => ({ meta, topic })),
        )
        .sort((a, b) => {
          const aTime = lastRevised.get(a.topic.id)?.getTime() ?? 0;
          const bTime = lastRevised.get(b.topic.id)?.getTime() ?? 0;
          return aTime - bTime;
        })[0];

      if (fallback) {
        const minutes = Math.min(REVISION_BLOCK, capacity);
        const daysToExam = fallback.meta.exam
          ? differenceInCalendarDays(fallback.meta.exam, date)
          : null;
        dayItems.push({
          date: key,
          topicId: fallback.topic.id,
          subjectId: fallback.meta.id,
          subjectName: fallback.meta.name,
          subjectColor: fallback.meta.color,
          topicName: fallback.topic.name,
          kind: "revision",
          startTime: "",
          minutes,
          order: 0,
          priority: Math.round((topicPriority(fallback.topic, date) + 0.15) * 100) / 100,
          reason:
            daysToExam !== null
              ? `Light day · revisit before the exam in ${daysToExam} day${
                  daysToExam === 1 ? "" : "s"
                }`
              : "Light day · keep the material warm",
        });
        lastRevised.set(fallback.topic.id, date);
        capacity -= minutes;
      }
    }

    dayItems.sort((a, b) => {
      const kind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
      if (kind !== 0) return kind;
      return b.priority - a.priority;
    });

    let cursor = dayStartMinute;
    dayItems.forEach((item, index) => {
      item.order = index;
      item.startTime = minuteToClock(cursor);
      cursor += item.minutes + BREAK_BETWEEN_BLOCKS;
    });
    items.push(...dayItems);
  }

  return items;
}

/**
 * Per-day minutes the devoted study days also spend on revision/quiz
 * maintenance. Covering topics must fit in what is left of each day, so the
 * capacity estimate reserves this before declaring the plan feasible.
 */
const CAPACITY_DAILY_MAINTENANCE = 45;

/**
 * Read-only sibling of `buildPlan`: measures per exam whether the remaining
 * topic material can possibly fit before that exam, using the same rules
 * (exams planned one after another — an exam's study days start the day after
 * the previous exam's date — revision-window reservation before each exam,
 * daily budget shared per day with the revision/quiz maintenance reserve,
 * mastered topics excluded). No compression: when material does not fit the
 * available real blocks, the UI shows the "too less time — increase your
 * per-day study hours" message instead of shrinking the roadmap's blocks.
 *
 * Keep the window math in sync with `buildPlan`.
 */
export function capacityShortfalls(
  topics: CapacityTopic[],
  options: SchedulerOptions,
): CapacityShortfall[] {
  if (topics.length === 0) return [];

  const start = startOfDay(options.startDate);
  const daily = Math.max(30, Math.round(options.dailyMinutes));
  const perStudyDay = Math.max(MIN_STUDY_BLOCK, daily - CAPACITY_DAILY_MAINTENANCE);

  type Track = {
    examId: string;
    subjectId: string;
    subjectName: string;
    subjectColor: string;
    exam: Date;
    examDate: string;
    studyDays: number;
    topics: CapacityTopic[];
  };

  const tracks = new Map<string, Track>();
  for (const topic of topics) {
    if (!topic.examId) continue;
    const exam = parseKey(topic.examDate);
    if (differenceInCalendarDays(exam, start) < 0) continue;
    const trackKey = `exam:${topic.examId}`;
    let track = tracks.get(trackKey);
    if (!track) {
      track = {
        examId: topic.examId,
        subjectId: topic.subjectId,
        subjectName: topic.subjectName,
        subjectColor: topic.subjectColor,
        exam,
        examDate: keyOf(exam),
        studyDays: 0,
        topics: [],
      };
      tracks.set(trackKey, track);
    }
    track.topics.push(topic);
  }

  // Sequential window math, matching `buildPlan`'s `activeTracks`: exam N's
  // study days only begin after the previous exam's DATE (the day after it),
  // because every day before an exam belongs to that exam alone. New material
  // must finish before the exam's reserved revision window (2–5 days, at
  // least 2) opens; the day before the exam is part of that window and never
  // carries new material.
  const ordered = [...tracks.values()].sort(
    (a, b) => a.exam.getTime() - b.exam.getTime() || a.examId.localeCompare(b.examId),
  );
  const groups: Track[][] = [];
  for (const track of ordered) {
    const group = groups[groups.length - 1];
    if (group && group[0].exam.getTime() === track.exam.getTime()) group.push(track);
    else groups.push([track]);
  }

  let windowStart = start;
  for (const group of groups) {
    const exam = group[0].exam;
    const daysToExam = differenceInCalendarDays(exam, start);
    const revisionDays = daysToExam === 0 ? 0 : revisionWindowDays(daysToExam);
    const revisionStart = addDays(exam, -revisionDays);
    const studyEnd =
      daysToExam <= 0
        ? null
        : revisionStart < windowStart
          ? addDays(windowStart, -1)
          : addDays(revisionStart, -1);
    const studyDays = studyEnd
      ? Math.max(0, differenceInCalendarDays(studyEnd, windowStart) + 1)
      : 0;
    for (const track of group) track.studyDays = studyDays;
    // The next exam's study days begin only after this exam's date.
    windowStart = addDays(exam, 1);
  }

  const shortfalls: CapacityShortfall[] = [];
  for (const track of tracks.values()) {
    const daysToExam = differenceInCalendarDays(track.exam, start);
    const requiredMinutes = track.topics.reduce(
      (sum, topic) =>
        topic.status === "mastered"
          ? sum
          : sum + Math.max(0, topic.estimatedMinutes - topic.completedMinutes),
      0,
    );
    shortfalls.push({
      examId: track.examId,
      subjectId: track.subjectId,
      subjectName: track.subjectName,
      subjectColor: track.subjectColor,
      examDate: track.examDate,
      examInDays: daysToExam,
      requiredMinutes,
      studyDays: track.studyDays,
      availableMinutes: track.studyDays * perStudyDay,
      shortfallMinutes: Math.max(0, requiredMinutes - track.studyDays * perStudyDay),
    });
  }
  return shortfalls.sort((a, b) => a.examInDays - b.examInDays);
}
