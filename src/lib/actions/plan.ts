"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { generatePlanForUser, rolloverMissedPlan } from "@/lib/plan-service";
import {
  awardXp,
  evaluateAchievements,
  syncDailyGoal,
  touchStreak,
  XP_RULES,
} from "@/lib/gamification";

function refresh() {
  revalidatePath("/dashboard");
  revalidatePath("/roadmap");
  revalidatePath("/analytics");
  revalidatePath("/achievements");
}

export async function togglePlanItemAction(formData: FormData) {
  const userId = await requireUserId();
  const itemId = String(formData.get("itemId") ?? "");

  const item = await prisma.planItem.findFirst({
    where: { id: itemId, planDay: { userId } },
    include: { topic: true },
  });
  if (!item) return;

  const completed = !item.completed;

  await prisma.planItem.update({
    where: { id: item.id },
    data: { completed, completedAt: completed ? new Date() : null },
  });

  if (completed) {
    await touchStreak(userId);
    await awardXp(userId, "plan_item", XP_RULES.planItem, item.id);

    if (item.topic) {
      const mastery = Math.min(
        100,
        item.topic.masteryScore + (item.kind === "study" ? 12 : 8),
      );
      const status =
        item.kind === "study"
          ? item.topic.status === "mastered" || mastery >= 85
            ? "mastered"
            : "studied"
          : "revised";

      await prisma.topic.update({
        where: { id: item.topic.id },
        data: { masteryScore: mastery, status, lastStudiedAt: new Date() },
      });
    }

    await syncDailyGoal(userId);
    await evaluateAchievements(userId);
  }

  refresh();
}

export async function reschedulePlanAction() {
  const userId = await requireUserId();
  await generatePlanForUser(userId, { startDate: new Date() });
  refresh();
}

export async function autoRolloverAction() {
  const userId = await requireUserId();
  const result = await rolloverMissedPlan(userId);
  if (result.rescheduled) refresh();
  return result;
}

export async function rebuildPlanAction() {
  const userId = await requireUserId();
  await generatePlanForUser(userId, { startDate: new Date() });
  refresh();
}
