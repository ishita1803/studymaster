import { prisma } from "@/lib/db";
import { ACHIEVEMENTS, type AchievementDef } from "@/lib/achievement-defs";
import { daysBetween, startOfDay } from "@/lib/utils";

export const XP_RULES = {
  focus: (minutes: number) => Math.max(2, Math.round(minutes / 2.5)),
  planItem: 5,
  quiz: 20,
  perfectQuiz: 15,
  flashcard: 1,
  dailyGoal: 15,
};

export function levelInfo(xp: number) {
  const safeXp = Math.max(0, xp);
  const level = Math.floor(Math.sqrt(safeXp / 50)) + 1;
  const startXp = 50 * (level - 1) ** 2;
  const nextXp = 50 * level ** 2;
  const progress = Math.min(
    100,
    Math.round(((safeXp - startXp) / Math.max(1, nextXp - startXp)) * 100),
  );
  return { level, startXp, nextXp, progress, xp: safeXp };
}

/** Keeps the daily streak accurate. Safe to call many times per day. */
export async function touchStreak(userId: string, at: Date = new Date()) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { streak: true, longestStreak: true, lastActiveDate: true },
  });
  if (!user) return;

  const today = startOfDay(at);
  const last = user.lastActiveDate ? startOfDay(user.lastActiveDate) : null;
  const gap = last ? daysBetween(last, today) : null;

  if (gap === 0) return;

  const streak = gap === 1 ? user.streak + 1 : 1;
  await prisma.user.update({
    where: { id: userId },
    data: {
      streak,
      longestStreak: Math.max(user.longestStreak, streak),
      lastActiveDate: today,
    },
  });
}

export async function awardXp(
  userId: string,
  action: string,
  amount: number,
  refId?: string,
) {
  if (amount <= 0) return;
  await prisma.$transaction([
    prisma.xpEvent.create({ data: { userId, action, amount, refId } }),
    prisma.user.update({ where: { id: userId }, data: { xp: { increment: amount } } }),
  ]);
}

/** Creates today's goal if needed and marks it done once the minutes land. */
export async function syncDailyGoal(userId: string) {
  const today = startOfDay();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { dailyStudyHours: true },
  });
  if (!user) return;

  const targetMinutes = Math.round(user.dailyStudyHours * 60);
  const goal = await prisma.dailyGoal.upsert({
    where: { userId_date: { userId, date: today } },
    create: { userId, date: today, targetMinutes },
    update: {},
  });
  if (goal.status === "done") return;

  const [focus, planItems] = await Promise.all([
    prisma.focusSession.aggregate({
      where: { userId, completed: true, startedAt: { gte: today } },
      _sum: { focusSeconds: true },
    }),
    prisma.planItem.findMany({
      where: {
        completed: true,
        planDay: { userId, date: today },
      },
      select: { minutes: true },
    }),
  ]);

  const minutes =
    Math.round((focus._sum.focusSeconds ?? 0) / 60) +
    planItems.reduce((sum, item) => sum + item.minutes, 0);

  if (minutes >= goal.targetMinutes && goal.targetMinutes > 0) {
    await prisma.dailyGoal.update({ where: { id: goal.id }, data: { status: "done" } });
    await awardXp(userId, "daily_goal", XP_RULES.dailyGoal, goal.id);
    await touchStreak(userId);
    await evaluateAchievements(userId);
  }
}

type Stats = {
  focusCount: number;
  focusSeconds: number;
  quizCount: number;
  perfectCount: number;
  cardsReviewed: number;
  masteredTopics: number;
  notesCount: number;
  planDone: number;
  aiAsks: number;
  streak: number;
  level: number;
};

async function collectStats(userId: string): Promise<Stats> {
  const [
    focusSessions,
    focusAggregate,
    quizCount,
    perfectCount,
    cardsReviewed,
    masteredTopics,
    notesCount,
    planDone,
    aiAsks,
    user,
  ] = await Promise.all([
    prisma.focusSession.count({ where: { userId, completed: true } }),
    prisma.focusSession.aggregate({
      where: { userId, completed: true },
      _sum: { focusSeconds: true },
    }),
    prisma.quizAttempt.count({ where: { userId, submittedAt: { not: null } } }),
    prisma.quizAttempt.count({
      where: { userId, submittedAt: { not: null }, maxScore: { gt: 0 }, score: { equals: 100 } },
    }),
    prisma.flashcardReview.count({ where: { userId } }),
    prisma.topic.count({ where: { userId, status: "mastered" } }),
    prisma.note.count({ where: { userId } }),
    prisma.planItem.count({ where: { completed: true, planDay: { userId } } }),
    prisma.aiMessage.count({ where: { userId, role: "user" } }),
    prisma.user.findUnique({ where: { id: userId }, select: { streak: true, xp: true } }),
  ]);

  // perfectCount above is a rough query; recompute properly below.
  const perfectAttempts = await prisma.quizAttempt.findMany({
    where: { userId, submittedAt: { not: null }, maxScore: { gt: 0 } },
    select: { score: true },
  });
  const perfect = perfectAttempts.filter((a) => a.score >= 100).length;

  return {
    focusCount: focusSessions,
    focusSeconds: focusAggregate._sum.focusSeconds ?? 0,
    quizCount,
    perfectCount: perfect || perfectCount,
    cardsReviewed,
    masteredTopics,
    notesCount,
    planDone,
    aiAsks,
    streak: user?.streak ?? 0,
    level: levelInfo(user?.xp ?? 0).level,
  };
}

function conditionMet(code: string, stats: Stats) {
  switch (code) {
    case "first_focus":
      return stats.focusCount >= 1;
    case "focus_10":
      return stats.focusCount >= 10;
    case "minutes_500":
      return stats.focusSeconds >= 500 * 60;
    case "quiz_first":
      return stats.quizCount >= 1;
    case "perfect_quiz":
      return stats.perfectCount >= 1;
    case "streak_7":
      return stats.streak >= 7;
    case "cards_50":
      return stats.cardsReviewed >= 50;
    case "topics_10":
      return stats.masteredTopics >= 10;
    case "notes_5":
      return stats.notesCount >= 5;
    case "plan_20":
      return stats.planDone >= 20;
    case "level_5":
      return stats.level >= 5;
    case "ai_10":
      return stats.aiAsks >= 10;
    default:
      return false;
  }
}

/** Grants any newly earned badges and returns them. */
export async function evaluateAchievements(userId: string): Promise<AchievementDef[]> {
  const [stats, earned] = await Promise.all([
    collectStats(userId),
    prisma.userAchievement.findMany({ where: { userId }, select: { achievementCode: true } }),
  ]);
  const earnedCodes = new Set(earned.map((e) => e.achievementCode));

  const newlyEarned = ACHIEVEMENTS.filter(
    (achievement) => !earnedCodes.has(achievement.code) && conditionMet(achievement.code, stats),
  );
  if (newlyEarned.length === 0) return [];

  const xpGain = newlyEarned.reduce((sum, a) => sum + a.xpReward, 0);

  await prisma.$transaction([
    ...newlyEarned.map((achievement) =>
      prisma.userAchievement.create({
        data: { userId, achievementCode: achievement.code },
      }),
    ),
    ...(xpGain > 0
      ? [
          prisma.xpEvent.create({
            data: { userId, action: "achievement", amount: xpGain },
          }),
          prisma.user.update({
            where: { id: userId },
            data: { xp: { increment: xpGain } },
          }),
        ]
      : []),
  ]);

  return newlyEarned;
}

export async function getAchievementOverview(userId: string) {
  const [stats, earned] = await Promise.all([
    collectStats(userId),
    prisma.userAchievement.findMany({
      where: { userId },
      select: { achievementCode: true, earnedAt: true },
    }),
  ]);
  const earnedMap = new Map(earned.map((e) => [e.achievementCode, e.earnedAt]));

  const progress: Record<string, { value: number; target: number }> = {
    first_focus: { value: stats.focusCount, target: 1 },
    focus_10: { value: stats.focusCount, target: 10 },
    minutes_500: { value: Math.round(stats.focusSeconds / 60), target: 500 },
    quiz_first: { value: stats.quizCount, target: 1 },
    perfect_quiz: { value: stats.perfectCount, target: 1 },
    streak_7: { value: stats.streak, target: 7 },
    cards_50: { value: stats.cardsReviewed, target: 50 },
    topics_10: { value: stats.masteredTopics, target: 10 },
    notes_5: { value: stats.notesCount, target: 5 },
    plan_20: { value: stats.planDone, target: 20 },
    level_5: { value: stats.level, target: 5 },
    ai_10: { value: stats.aiAsks, target: 10 },
  };

  return ACHIEVEMENTS.map((achievement) => ({
    ...achievement,
    earnedAt: earnedMap.get(achievement.code) ?? null,
    progress: progress[achievement.code] ?? { value: 0, target: 1 },
  }));
}
