import { prisma } from "@/lib/db";
import { addDays, dateKey, daysBetween, startOfDay } from "@/lib/utils";

export type WeakTopic = {
  topicId: string;
  topicName: string;
  subjectName: string;
  subjectColor: string;
  accuracy: number;
  total: number;
  correct: number;
};

export async function getWeakTopics(userId: string): Promise<WeakTopic[]> {
  const answers = await prisma.answer.findMany({
    where: {
      attempt: { userId, submittedAt: { not: null } },
      question: { quiz: { topicId: { not: null } } },
    },
    select: {
      isCorrect: true,
      question: {
        select: {
          quiz: {
            select: {
              topicId: true,
              topic: {
                select: {
                  name: true,
                  subject: { select: { name: true, color: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const grouped = new Map<string, { correct: number; total: number; name: string; subjectName: string; color: string }>();

  for (const answer of answers) {
    const topic = answer.question.quiz.topic;
    const topicId = answer.question.quiz.topicId;
    if (!topicId || !topic) continue;
    const entry = grouped.get(topicId) ?? {
      correct: 0,
      total: 0,
      name: topic.name,
      subjectName: topic.subject.name,
      color: topic.subject.color,
    };
    entry.total += 1;
    if (answer.isCorrect) entry.correct += 1;
    grouped.set(topicId, entry);
  }

  return [...grouped.entries()]
    .map(([topicId, entry]) => ({
      topicId,
      topicName: entry.name,
      subjectName: entry.subjectName,
      subjectColor: entry.color,
      accuracy: Math.round((entry.correct / entry.total) * 100),
      total: entry.total,
      correct: entry.correct,
    }))
    .filter((entry) => entry.total >= 3 && entry.accuracy < 60)
    .sort((a, b) => a.accuracy - b.accuracy);
}

export type AccuracyStat = { correct: number; total: number; accuracy: number };

/**
 * Per-topic quiz accuracy for every topic that has been attempted. Unlike
 * `getWeakTopics`, this keeps high-accuracy and low-sample topics too, so the
 * scheduler can use quiz performance as one input in the priority score.
 */
export async function getTopicAccuracy(
  userId: string,
): Promise<Map<string, AccuracyStat>> {
  const answers = await prisma.answer.findMany({
    where: {
      attempt: { userId, submittedAt: { not: null } },
      question: { quiz: { topicId: { not: null } } },
    },
    select: {
      isCorrect: true,
      question: { select: { quiz: { select: { topicId: true } } } },
    },
  });

  const map = new Map<string, AccuracyStat>();
  for (const answer of answers) {
    const topicId = answer.question.quiz.topicId;
    if (!topicId) continue;
    const entry = map.get(topicId) ?? { correct: 0, total: 0, accuracy: 0 };
    entry.total += 1;
    if (answer.isCorrect) entry.correct += 1;
    map.set(topicId, entry);
  }
  for (const entry of map.values()) {
    entry.accuracy = entry.total
      ? Math.round((entry.correct / entry.total) * 100)
      : 0;
  }
  return map;
}

export async function getAccuracyBySubject(userId: string) {
  const answers = await prisma.answer.findMany({
    where: {
      attempt: { userId, submittedAt: { not: null } },
      question: { quiz: { subjectId: { not: null } } },
    },
    select: {
      isCorrect: true,
      question: { select: { quiz: { select: { subjectId: true } } } },
    },
  });

  const map = new Map<string, AccuracyStat>();
  for (const answer of answers) {
    const subjectId = answer.question.quiz.subjectId;
    if (!subjectId) continue;
    const entry = map.get(subjectId) ?? { correct: 0, total: 0, accuracy: 0 };
    entry.total += 1;
    if (answer.isCorrect) entry.correct += 1;
    map.set(subjectId, entry);
  }
  for (const entry of map.values()) {
    entry.accuracy = Math.round((entry.correct / entry.total) * 100);
  }
  return map;
}

export async function getOverallAccuracy(userId: string): Promise<AccuracyStat> {
  const answers = await prisma.answer.findMany({
    where: { attempt: { userId, submittedAt: { not: null } } },
    select: { isCorrect: true },
  });
  const total = answers.length;
  const correct = answers.filter((a) => a.isCorrect).length;
  return { correct, total, accuracy: total ? Math.round((correct / total) * 100) : 0 };
}

export function topicCompletion(status: string, masteryScore: number) {
  const byStatus: Record<string, number> = {
    mastered: 100,
    revised: 85,
    studied: 70,
    in_progress: 40,
    not_started: 0,
  };
  return Math.max(byStatus[status] ?? 0, Math.min(100, masteryScore));
}

export function computeReadiness(params: {
  topics: { status: string; masteryScore: number; lastStudiedAt: Date | null }[];
  accuracy: number | null;
  studyDaysLast7: number;
  now?: Date;
}) {
  const { topics, accuracy, studyDaysLast7 } = params;
  const now = params.now ?? new Date();

  if (topics.length === 0) {
    return { score: 0, completion: 0, accuracy: 0, freshness: 0, consistency: 0 };
  }

  const completion =
    topics.reduce((sum, t) => sum + topicCompletion(t.status, t.masteryScore), 0) /
    topics.length;

  const freshness =
    (topics.reduce((sum, t) => {
      if (!t.lastStudiedAt) return sum;
      const days = Math.max(0, daysBetween(t.lastStudiedAt, now));
      return sum + Math.exp(-days / 10) * 100;
    }, 0) /
      topics.length) || 0;

  const consistency = Math.min(100, (studyDaysLast7 / 7) * 100);
  const accuracyScore = accuracy ?? (completion > 0 ? 55 : 0);

  const score = Math.round(
    completion * 0.35 + accuracyScore * 0.35 + freshness * 0.2 + consistency * 0.1,
  );

  return {
    score: Math.min(100, Math.max(0, score)),
    completion: Math.round(completion),
    accuracy: Math.round(accuracyScore),
    freshness: Math.round(freshness),
    consistency: Math.round(consistency),
  };
}

function studyDaySet(sessions: { startedAt: Date }[]) {
  return new Set(sessions.map((session) => dateKey(session.startedAt)));
}

export async function getDashboardData(userId: string) {
  const now = new Date();
  const today = startOfDay(now);
  const weekStart = addDays(today, -6);

  const [
    user,
    subjects,
    topics,
    todayPlan,
    weekSessions,
    recentAttempts,
    dueCards,
    weakTopics,
    focusToday,
    recentAchievements,
    overallAccuracy,
    nextPlanItem,
    lastNote,
    latestQuiz,
  ] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.subject.findMany({
      where: { userId },
      include: { topics: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.topic.findMany({ where: { userId } }),
    prisma.planDay.findUnique({
      where: { userId_date: { userId, date: today } },
      include: {
        items: {
          include: {
            topic: true,
            subject: { select: { id: true, name: true, color: true } },
          },
          orderBy: { order: "asc" },
        },
      },
    }),
    prisma.focusSession.findMany({
      where: { userId, completed: true, startedAt: { gte: weekStart } },
      select: { focusSeconds: true, startedAt: true, subjectId: true },
    }),
    prisma.quizAttempt.findMany({
      where: { userId, submittedAt: { not: null } },
      orderBy: { submittedAt: "desc" },
      take: 6,
      include: { quiz: { select: { id: true, title: true } } },
    }),
    prisma.flashcard.count({ where: { userId, dueAt: { lte: now } } }),
    getWeakTopics(userId),
    prisma.focusSession.aggregate({
      where: { userId, completed: true, startedAt: { gte: today } },
      _sum: { focusSeconds: true },
    }),
    prisma.userAchievement.findMany({
      where: { userId },
      orderBy: { earnedAt: "desc" },
      take: 3,
      include: { achievement: true },
    }),
    getOverallAccuracy(userId),
    // The next unfinished block today or in the future — the most useful
    // "resume" target when nothing is in progress in the browser.
    prisma.planItem.findFirst({
      where: {
        completed: false,
        planDay: { userId, date: { gte: today } },
      },
      orderBy: [{ planDay: { date: "asc" } }, { order: "asc" }],
      include: {
        planDay: { select: { date: true } },
        topic: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true, color: true } },
      },
    }),
    prisma.note.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        subject: { select: { name: true } },
      },
    }),
    prisma.quiz.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
        _count: { select: { questions: true } },
      },
    }),
  ]);

  const studiedTopics = topics.filter((topic) =>
    ["studied", "revised", "mastered"].includes(topic.status),
  ).length;
  const masteredTopics = topics.filter(
    (topic) => topic.status === "mastered" || topic.masteryScore >= 80,
  ).length;

  const dayKeys = studyDaySet(weekSessions);
  const studyDaysLast7 = dayKeys.size;

  const readiness = computeReadiness({
    topics,
    accuracy: overallAccuracy.total > 0 ? overallAccuracy.accuracy : null,
    studyDaysLast7,
    now,
  });

  const weeklyActivity = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    const key = dateKey(date);
    const seconds = weekSessions
      .filter((session) => dateKey(session.startedAt) === key)
      .reduce((sum, session) => sum + session.focusSeconds, 0);
    return {
      key,
      label: date.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2),
      minutes: Math.round(seconds / 60),
    };
  });

  const todayFocusMinutes = Math.round((focusToday._sum.focusSeconds ?? 0) / 60);
  const planDoneMinutes =
    todayPlan?.items
      .filter((item) => item.completed)
      .reduce((sum, item) => sum + item.minutes, 0) ?? 0;

  const upcomingExams = subjects
    .filter((subject) => subject.examDate && daysBetween(now, subject.examDate) >= 0)
    .sort((a, b) => (a.examDate!.getTime() ?? 0) - (b.examDate!.getTime() ?? 0))
    .slice(0, 3);

  const weekMinutes = Math.round(
    weekSessions.reduce((sum, session) => sum + session.focusSeconds, 0) / 60,
  );

  return {
    user,
    subjects,
    topics,
    todayPlan,
    weakTopics,
    recentAttempts,
    dueCards,
    recentAchievements,
    stats: {
      studiedTopics,
      totalTopics: topics.length,
      masteredTopics,
      syllabusCompletion: topics.length
        ? Math.round((studiedTopics / topics.length) * 100)
        : 0,
      weekMinutes,
      studyDaysLast7,
      todayFocusMinutes,
      todayMinutes: todayFocusMinutes + planDoneMinutes,
      goalMinutes: Math.round(user.dailyStudyHours * 60),
      dueCards,
      overallAccuracy: overallAccuracy.total > 0 ? overallAccuracy.accuracy : null,
    },
    readiness,
    weeklyActivity,
    upcomingExams,
    nextPlanItem,
    lastNote,
    latestQuiz,
  };
}

export async function getAnalytics(userId: string) {
  const now = new Date();
  const today = startOfDay(now);
  const weekStart = addDays(today, -6);
  const prevWeekStart = addDays(today, -13);
  const monthStart = addDays(today, -29);

  const [user, subjects, topics, sessions, attempts, accuracyBySubject, overall, cardReviews, totalCards, dueCards, notesCount, planDone] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      prisma.subject.findMany({
        where: { userId },
        include: { topics: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.topic.findMany({ where: { userId } }),
      prisma.focusSession.findMany({
        where: { userId, completed: true, startedAt: { gte: monthStart } },
        select: { focusSeconds: true, startedAt: true, subjectId: true },
      }),
      prisma.quizAttempt.findMany({
        where: { userId, submittedAt: { not: null } },
        orderBy: { submittedAt: "asc" },
        take: 20,
        include: { quiz: { select: { id: true, title: true } } },
      }),
      getAccuracyBySubject(userId),
      getOverallAccuracy(userId),
      prisma.flashcardReview.count({ where: { userId } }),
      prisma.flashcard.count({ where: { userId } }),
      prisma.flashcard.count({ where: { userId, dueAt: { lte: now } } }),
      prisma.note.count({ where: { userId } }),
      prisma.planItem.count({ where: { completed: true, planDay: { userId } } }),
    ]);

  const weekSessions = sessions.filter((session) => session.startedAt >= weekStart);
  const prevWeekSessions = sessions.filter(
    (session) => session.startedAt >= prevWeekStart && session.startedAt < weekStart,
  );
  const weekMinutes = Math.round(
    weekSessions.reduce((sum, session) => sum + session.focusSeconds, 0) / 60,
  );
  const prevWeekMinutes = Math.round(
    prevWeekSessions.reduce((sum, session) => sum + session.focusSeconds, 0) / 60,
  );

  const activity = Array.from({ length: 14 }, (_, index) => {
    const date = addDays(today, -13 + index);
    const key = dateKey(date);
    const seconds = sessions
      .filter((session) => dateKey(session.startedAt) === key)
      .reduce((sum, session) => sum + session.focusSeconds, 0);
    return {
      key,
      label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      weekday: date.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2),
      minutes: Math.round(seconds / 60),
    };
  });

  const studyDaysLast7 = new Set(
    weekSessions.map((session) => dateKey(session.startedAt)),
  ).size;

  const subjectStats = subjects.map((subject) => {
    const accuracy = accuracyBySubject.get(subject.id) ?? null;
    const subjectStudyDays = new Set(
      weekSessions
        .filter((session) => session.subjectId === subject.id)
        .map((session) => dateKey(session.startedAt)),
    ).size;
    const readiness = computeReadiness({
      topics: subject.topics,
      accuracy: accuracy?.accuracy ?? null,
      studyDaysLast7: subjectStudyDays,
      now,
    });
    const studied = subject.topics.filter((topic) =>
      ["studied", "revised", "mastered"].includes(topic.status),
    ).length;
    return {
      id: subject.id,
      name: subject.name,
      color: subject.color,
      examDate: subject.examDate,
      topicCount: subject.topics.length,
      studied,
      completion: subject.topics.length
        ? Math.round((studied / subject.topics.length) * 100)
        : 0,
      accuracy: accuracy?.accuracy ?? null,
      readiness: readiness.score,
    };
  });

  const masteryBreakdown = {
    mastered: topics.filter((t) => t.status === "mastered" || t.masteryScore >= 80).length,
    needsRevision: topics.filter(
      (t) =>
        t.status !== "mastered" &&
        (t.masteryScore < 50 ||
          (t.lastStudiedAt && daysBetween(t.lastStudiedAt, now) > 7)),
    ).length,
    inProgress: topics.filter((t) =>
      ["in_progress", "studied", "revised"].includes(t.status),
    ).length,
    notStarted: topics.filter((t) => t.status === "not_started").length,
  };

  const overallReadiness = computeReadiness({
    topics,
    accuracy: overall.total > 0 ? overall.accuracy : null,
    studyDaysLast7,
    now,
  });

  return {
    user,
    stats: {
      weekMinutes,
      prevWeekMinutes,
      totalMinutes: Math.round(
        sessions.reduce((sum, session) => sum + session.focusSeconds, 0) / 60,
      ),
      quizCount: attempts.length,
      accuracy: overall.accuracy,
      cardsReviewed: cardReviews,
      totalCards,
      dueCards,
      notesCount,
      planDone,
      studyDaysLast7,
    },
    activity,
    attempts: attempts.map((attempt) => ({
      id: attempt.id,
      quizId: attempt.quizId,
      title: attempt.quiz.title,
      score: attempt.score,
      submittedAt: attempt.submittedAt,
    })),
    subjectStats,
    masteryBreakdown,
    readiness: overallReadiness,
  };
}