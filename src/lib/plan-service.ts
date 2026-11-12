import { prisma } from "@/lib/db";
import {
  buildPlan,
  capacityShortfalls as schedulerCapacityShortfalls,
  clockToMinute,
  type CapacityTopic,
  type ScheduledItem,
} from "@/lib/scheduler";
import { getTopicAccuracy, getWeakTopics } from "@/lib/analytics";
import { coveringExams } from "@/lib/exam-selection";
import {
  ratingMinuteFactor,
  ratingSchedulerDifficulty,
} from "@/lib/exam-rating";
import { syncAllSubjectExamDates } from "@/lib/exams";
import { addDays, dateKey, parseDateKey, startOfDay } from "@/lib/utils";

export async function generatePlanForUser(
  userId: string,
  options?: { startDate?: Date; horizonDays?: number; dailyMinutes?: number },
) {
  // Keep the nearest-exam cache fresh (for example after a test date passes)
  // before the scheduler reads each subject's deadline.
  await syncAllSubjectExamDates(userId);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const topics = await prisma.topic.findMany({
    where: { userId, approved: true },
    include: {
      subject: true,
      children: { select: { id: true } },
    },
  });

  // Chapters are containers; only leaf topics are scheduled so the shared
  // syllabus is not double-counted (chapter + every subtopic).
  const schedulable = topics.filter((topic) => topic.children.length === 0);

  const completedItems = await prisma.planItem.findMany({
    where: { completed: true, kind: "study", planDay: { userId } },
    select: { topicId: true, minutes: true },
  });
  const completedByTopic = new Map<string, number>();
  for (const item of completedItems) {
    if (!item.topicId) continue;
    completedByTopic.set(
      item.topicId,
      (completedByTopic.get(item.topicId) ?? 0) + item.minutes,
    );
  }

  const weak = await getWeakTopics(userId);
  const weakIds = new Set(weak.map((entry) => entry.topicId));
  const topicAccuracy = await getTopicAccuracy(userId);

  // Each test owns the topics it selects. Load the associations so every
  // shared-syllabus topic is scheduled against the nearest test that includes
  // it. An exam with no rows is a legacy test and covers the whole subject.
  const today = startOfDay();
  const exams = await prisma.exam.findMany({
    where: { userId, date: { gte: today } },
    orderBy: [{ date: "asc" }, { importance: "desc" }],
    include: { examTopics: { select: { topicId: true, difficulty: true } } },
  });

  const examsBySubject = new Map<string, typeof exams>();
  for (const exam of exams) {
    const list = examsBySubject.get(exam.subjectId) ?? [];
    list.push(exam);
    examsBySubject.set(exam.subjectId, list);
  }

  // Shared-syllabus completion per subject, based on leaf topics.
  const syllabusStats = new Map<string, { total: number; completed: number }>();
  for (const topic of schedulable) {
    const entry = syllabusStats.get(topic.subjectId) ?? { total: 0, completed: 0 };
    entry.total += 1;
    const doneMinutes = completedByTopic.get(topic.id) ?? 0;
    const done =
      ["studied", "revised", "mastered"].includes(topic.status) ||
      doneMinutes >= Math.max(1, topic.estimatedMinutes) * 0.9;
    if (done) entry.completed += 1;
    syllabusStats.set(topic.subjectId, entry);
  }

  const start = startOfDay(options?.startDate ?? new Date());
  const planned = schedulable.flatMap((topic) => {
    // Every test that selects this topic gets its own track. This is what lets
    // a subject have several independent exams: the same shared-syllabus topic
    // can be revised for a unit test and again for the final, and the day before
    // each exam can be reserved for that exam alone.
    const exams = coveringExams(examsBySubject.get(topic.subjectId) ?? [], topic.id);
    // Subjects are study containers. A topic only enters the roadmap when a
    // dated test selects it, so unselected topics stay out of the plan.
    if (exams.length === 0) return [];

    const stats = syllabusStats.get(topic.subjectId);
    const accuracy = topicAccuracy.get(topic.id);
    const weakByQuiz =
      accuracy != null && accuracy.total >= 2 && accuracy.accuracy < 60;

    // Legacy whole-subject exams have no explicit selection, so the topic
    // keeps its default medium weighting. The same rating + weighted-minutes
    // rules feed both this plan and `capacityShortfallsForUser`.
    return exams.map((exam) => {
      const rating =
        exam.examTopics.find((entry) => entry.topicId === topic.id)?.difficulty ??
        "medium";
      const estimated = Math.max(
        5,
        Math.round(topic.estimatedMinutes * ratingMinuteFactor(rating)),
      );
      return {
        id: topic.id,
        subjectId: topic.subjectId,
        subjectName: topic.subject.name,
        subjectColor: topic.subject.color,
        name: topic.name,
        difficulty: ratingSchedulerDifficulty(rating, topic.difficulty),
        importance: topic.importance,
        estimatedMinutes: estimated,
        completedMinutes: completedByTopic.get(topic.id) ?? 0,
        examDate: dateKey(exam.date),
        examId: exam.id,
        status: topic.status,
        masteryScore: topic.masteryScore,
        weak: weakIds.has(topic.id) || weakByQuiz,
        subjectDifficulty: exam.difficulty ?? topic.subject.difficulty,
        prepLevel: exam.prepLevel ?? topic.subject.prepLevel,
        examImportance: exam.importance ?? topic.subject.importance,
        syllabusTotal: stats?.total ?? 0,
        syllabusCompleted: stats?.completed ?? 0,
        quizAccuracy: accuracy?.accuracy ?? null,
      };
    });
  });

  const scheduled = buildPlan(planned, {
    startDate: start,
    dailyMinutes: options?.dailyMinutes ?? Math.round(user.dailyStudyHours * 60),
    horizonDays: options?.horizonDays,
    dayStartMinute: clockToMinute(user.studyStartTime),
  });

  // Keep completed blocks as a record of real work. Everything still open is
  // regenerated from the requested start date, including overdue blocks, so a
  // missed day is genuinely re-planned rather than left stranded in the past.
  await prisma.planItem.deleteMany({
    where: {
      completed: false,
      planDay: { userId },
    },
  });

  const grouped = new Map<string, ScheduledItem[]>();
  for (const item of scheduled) {
    const list = grouped.get(item.date) ?? [];
    list.push(item);
    grouped.set(item.date, list);
  }

  for (const [key, items] of grouped) {
    const date = parseDateKey(key);
    const day = await prisma.planDay.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date },
      update: {},
    });
    await prisma.planItem.createMany({
      data: items.map((item) => ({
        planDayId: day.id,
        topicId: item.topicId,
        subjectId: item.subjectId,
        title: item.topicName,
        kind: item.kind,
        startTime: item.startTime,
        minutes: item.minutes,
        order: item.order,
        priority: item.priority,
        reason: item.reason,
      })),
    });
  }

  // Drop days that no longer hold any work (including old UTC-shifted days).
  await prisma.planDay.deleteMany({
    where: { userId, items: { none: {} } },
  });

  return { items: scheduled.length, days: grouped.size };
}

/**
 * Read-only capacity check for the roadmap banner. Uses the same planning
 * rules as `generatePlanForUser` (same exam selection + rating weighting) and
 * asks the scheduler whether the remaining material fits the days available
 * before each exam. Returns one entry per upcoming exam track.
 */
export async function capacityShortfallsForUser(userId: string, today = startOfDay()) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const exams = await prisma.exam.findMany({
    where: { userId, date: { gte: today } },
    orderBy: [{ date: "asc" }, { importance: "desc" }],
    include: { examTopics: { select: { topicId: true, difficulty: true } } },
  });
  if (exams.length === 0) return [];

  const topics = await prisma.topic.findMany({
    where: { userId, approved: true },
    include: { subject: true, children: { select: { id: true } } },
  });
  const schedulable = topics.filter((topic) => topic.children.length === 0);
  if (schedulable.length === 0) return [];

  const completedItems = await prisma.planItem.findMany({
    where: { completed: true, kind: "study", planDay: { userId } },
    select: { topicId: true, minutes: true },
  });
  const completedByTopic = new Map<string, number>();
  for (const item of completedItems) {
    if (!item.topicId) continue;
    completedByTopic.set(
      item.topicId,
      (completedByTopic.get(item.topicId) ?? 0) + item.minutes,
    );
  }

  const examsBySubject = new Map<string, typeof exams>();
  for (const exam of exams) {
    const list = examsBySubject.get(exam.subjectId) ?? [];
    list.push(exam);
    examsBySubject.set(exam.subjectId, list);
  }

  const capacityTopics: CapacityTopic[] = [];
  for (const topic of schedulable) {
    const covering = coveringExams(examsBySubject.get(topic.subjectId) ?? [], topic.id);
    for (const exam of covering) {
      const rating =
        exam.examTopics.find((entry) => entry.topicId === topic.id)?.difficulty ??
        "medium";
      capacityTopics.push({
        id: topic.id,
        subjectId: topic.subjectId,
        subjectName: topic.subject.name,
        subjectColor: topic.subject.color,
        estimatedMinutes: Math.max(
          5,
          Math.round(topic.estimatedMinutes * ratingMinuteFactor(rating)),
        ),
        completedMinutes: completedByTopic.get(topic.id) ?? 0,
        examDate: dateKey(exam.date),
        examId: exam.id,
        status: topic.status,
      });
    }
  }

  return schedulerCapacityShortfalls(capacityTopics, {
    startDate: today,
    dailyMinutes: Math.round(user.dailyStudyHours * 60),
  });
}

/**
 * Re-plans overdue, unfinished work from today. Completed blocks are preserved.
 * Returns quickly when there is nothing to roll over.
 */
export async function rolloverMissedPlan(userId: string) {
  const today = startOfDay(new Date());
  const missed = await prisma.planItem.count({
    where: {
      completed: false,
      planDay: { userId, date: { lt: today } },
    },
  });

  if (missed === 0) {
    return { rescheduled: false, missed: 0, items: 0, days: 0 };
  }

  const result = await generatePlanForUser(userId, { startDate: today });
  return { rescheduled: true, missed, ...result };
}

export async function getPlanWindow(userId: string, from: Date, dayCount = 7) {
  const start = startOfDay(from);
  const end = addDays(start, dayCount - 1);

  const days = await prisma.planDay.findMany({
    where: { userId, date: { gte: start, lte: end } },
    include: {
      items: {
        include: {
          topic: { select: { id: true, name: true, status: true } },
          subject: { select: { id: true, name: true, color: true } },
        },
        orderBy: { order: "asc" },
      },
    },
    orderBy: { date: "asc" },
  });

  const byKey = new Map(days.map((day) => [dateKey(day.date), day]));

  return Array.from({ length: dayCount }, (_, index) => {
    const date = addDays(start, index);
    const key = dateKey(date);
    return {
      date,
      key,
      plan: byKey.get(key) ?? null,
    };
  });
}
