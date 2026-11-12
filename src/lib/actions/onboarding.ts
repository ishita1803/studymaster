"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { generatePlanForUser } from "@/lib/plan-service";
import { startOfDay } from "@/lib/utils";

type SubjectDraft = {
  name: string;
  examDate?: string | null;
  importance?: number;
  difficulty?: number;
  prepLevel?: string;
  color?: string;
  topics?: string[];
};

type OnboardingPayload = {
  dailyStudyHours: number;
  subjects: SubjectDraft[];
};

const COLORS = ["mint", "violet", "pink", "amber", "sky"];
const PREP_LEVELS = ["beginner", "intermediate", "advanced"];

export async function completeOnboardingAction(payload: string) {
  const userId = await requireUserId();

  let parsed: OnboardingPayload;
  try {
    parsed = JSON.parse(payload) as OnboardingPayload;
  } catch {
    return { error: "Something went wrong with the form. Please try again." };
  }

  const dailyStudyHours = Math.min(12, Math.max(0.5, Number(parsed.dailyStudyHours) || 2));
  const drafts = (parsed.subjects ?? [])
    .filter((subject) => subject.name?.trim())
    .slice(0, 8);

  if (drafts.length === 0) {
    return { error: "Add at least one subject so Nova can build your roadmap." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { dailyStudyHours, onboarded: true },
  });

  for (let index = 0; index < drafts.length; index++) {
    const draft = drafts[index];
    const examDate = draft.examDate ? new Date(`${draft.examDate}T00:00:00`) : null;
    const validExamDate =
      examDate && !Number.isNaN(examDate.getTime()) && examDate.getTime() > Date.now() - 86_400_000
        ? examDate
        : null;

    const subject = await prisma.subject.create({
      data: {
        userId,
        name: draft.name.trim().slice(0, 60),
        color: COLORS.includes(draft.color ?? "") ? draft.color! : COLORS[index % COLORS.length],
        examDate: validExamDate,
        importance: Math.min(5, Math.max(1, Number(draft.importance) || 3)),
        difficulty: Math.min(5, Math.max(1, Number(draft.difficulty) || 3)),
        prepLevel: PREP_LEVELS.includes(draft.prepLevel ?? "")
          ? draft.prepLevel!
          : "intermediate",
      },
    });

    const topicNames = [...new Set((draft.topics ?? []).map((topic) => topic.trim()).filter(Boolean))].slice(
      0,
      30,
    );

    if (validExamDate) {
      await prisma.exam.create({
        data: {
          userId,
          subjectId: subject.id,
          name: `${subject.name} exam`,
          date: validExamDate,
          importance: subject.importance,
          difficulty: subject.difficulty,
          prepLevel: subject.prepLevel,
        },
      });
    }

    if (topicNames.length > 0) {
      await prisma.topic.createMany({
        data: topicNames.map((name) => ({
          userId,
          subjectId: subject.id,
          name: name.slice(0, 80),
          difficulty: subject.difficulty,
          importance: Math.min(5, Math.max(1, Number(draft.importance) || 3)),
          estimatedMinutes: 60,
        })),
      });
    }
  }

  await generatePlanForUser(userId, {
    startDate: new Date(),
    dailyMinutes: Math.round(dailyStudyHours * 60),
  });

  await prisma.dailyGoal.upsert({
    where: { userId_date: { userId, date: startOfDay() } },
    create: {
      userId,
      date: startOfDay(),
      targetMinutes: Math.round(dailyStudyHours * 60),
    },
    update: {},
  });

  redirect("/dashboard");
}
