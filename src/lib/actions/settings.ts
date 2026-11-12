"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { generatePlanForUser } from "@/lib/plan-service";
import { clamp, startOfDay } from "@/lib/utils";

export type SettingsState = { ok?: boolean; error?: string };

export async function updateProfileAction(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const userId = await requireUserId();
  const name = String(formData.get("name") ?? "").trim();
  const hours = clamp(Number(formData.get("dailyStudyHours") ?? 2), 0.5, 12);
  const startTime = String(formData.get("studyStartTime") ?? "18:00").trim();
  const reminderEnabled = formData.get("reminderEnabled") === "on";

  if (name.length < 2) return { error: "Your name needs at least two characters." };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
    return { error: "Choose a valid study start time." };
  }

  const previous = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { dailyStudyHours: true, studyStartTime: true },
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      name: name.slice(0, 60),
      dailyStudyHours: hours,
      studyStartTime: startTime,
      reminderEnabled,
    },
  });

  // A different daily budget or start time changes how blocks are laid out.
  // Re-plan open work from today; completed blocks stay untouched.
  if (
    previous.dailyStudyHours !== hours ||
    previous.studyStartTime !== startTime
  ) {
    await generatePlanForUser(userId);
  }

  await prisma.dailyGoal.upsert({
    where: { userId_date: { userId, date: startOfDay() } },
    create: { userId, date: startOfDay(), targetMinutes: Math.round(hours * 60) },
    update: { targetMinutes: Math.round(hours * 60) },
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/roadmap");
  revalidatePath("/focus");
  return { ok: true };
}

export async function changePasswordAction(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const userId = await requireUserId();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 6) return { error: "New password needs at least 6 characters." };
  if (next !== confirm) return { error: "New passwords don't match." };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "Account not found." };

  const valid = await bcrypt.compare(current, user.passwordHash);
  if (!valid) return { error: "Current password is incorrect." };

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(next, 10) },
  });

  return { ok: true };
}
