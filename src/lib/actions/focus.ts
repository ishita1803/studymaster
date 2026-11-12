"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import {
  awardXp,
  evaluateAchievements,
  syncDailyGoal,
  touchStreak,
  XP_RULES,
} from "@/lib/gamification";
import { clamp } from "@/lib/utils";

export async function logFocusSessionAction(formData: FormData) {
  const userId = await requireUserId();

  const focusSeconds = clamp(Math.round(Number(formData.get("focusSeconds") ?? 0)), 0, 6 * 3600);
  const plannedMinutes = clamp(Math.round(Number(formData.get("plannedMinutes") ?? 25)), 1, 180);
  const label = String(formData.get("label") ?? "Focus session").slice(0, 80);
  const subjectId = String(formData.get("subjectId") ?? "") || null;
  const topicId = String(formData.get("topicId") ?? "") || null;

  if (focusSeconds < 30) {
    return { ok: false, error: "Session was too short to log." };
  }

  let safeSubjectId: string | null = null;
  let safeTopicId: string | null = null;

  if (subjectId) {
    const subject = await prisma.subject.findFirst({ where: { id: subjectId, userId } });
    if (subject) safeSubjectId = subject.id;
  }
  if (topicId) {
    const topic = await prisma.topic.findFirst({ where: { id: topicId, userId } });
    if (topic) {
      safeTopicId = topic.id;
      safeSubjectId = topic.subjectId;
    }
  }

  const minutes = Math.max(1, Math.round(focusSeconds / 60));
  const completed = focusSeconds >= Math.round(plannedMinutes * 60 * 0.8);

  await prisma.focusSession.create({
    data: {
      userId,
      subjectId: safeSubjectId,
      topicId: safeTopicId,
      label,
      plannedMinutes,
      focusSeconds,
      completed,
      startedAt: new Date(Date.now() - focusSeconds * 1000),
      endedAt: new Date(),
    },
  });

  let xp = 0;

  if (completed) {
    xp = XP_RULES.focus(minutes);
    await touchStreak(userId);
    await awardXp(userId, "focus", xp);

    if (safeTopicId) {
      const topic = await prisma.topic.findUnique({ where: { id: safeTopicId } });
      if (topic) {
        const mastery = Math.min(100, topic.masteryScore + 6);
        await prisma.topic.update({
          where: { id: topic.id },
          data: {
            masteryScore: mastery,
            status:
              topic.status === "mastered"
                ? "mastered"
                : topic.status === "not_started"
                  ? "in_progress"
                  : topic.status,
            lastStudiedAt: new Date(),
          },
        });
      }
    }

    await syncDailyGoal(userId);
    await evaluateAchievements(userId);
  }

  revalidatePath("/focus");
  revalidatePath("/dashboard");
  revalidatePath("/analytics");
  revalidatePath("/achievements");

  return { ok: true, xp, completed, minutes };
}
