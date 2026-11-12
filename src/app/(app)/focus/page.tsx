import type { Metadata } from "next";
import { Coffee, Flame, Timer, Zap } from "lucide-react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { FocusTimer } from "@/components/focus-timer";
import { PageHeader } from "@/components/ui";
import { addDays, colorVar, formatMinutes, startOfDay } from "@/lib/utils";

export const metadata: Metadata = { title: "Focus timer" };

export default async function FocusPage({
  searchParams,
}: {
  searchParams: Promise<{ subjectId?: string; topicId?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const today = startOfDay();
  const weekStart = addDays(today, -6);

  const [subjects, sessionsToday, weekAggregate, goal] = await Promise.all([
    prisma.subject.findMany({
      where: { userId: user.id },
      include: { topics: { select: { id: true, name: true }, orderBy: { name: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.focusSession.findMany({
      where: { userId: user.id, startedAt: { gte: today } },
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
    prisma.focusSession.aggregate({
      where: { userId: user.id, completed: true, startedAt: { gte: weekStart } },
      _sum: { focusSeconds: true },
    }),
    prisma.dailyGoal.findUnique({
      where: { userId_date: { userId: user.id, date: today } },
    }),
  ]);

  const completedToday = sessionsToday.filter((session) => session.completed);
  const todayMinutes = Math.round(
    completedToday.reduce((sum, session) => sum + session.focusSeconds, 0) / 60,
  );
  const weekMinutes = Math.round((weekAggregate._sum.focusSeconds ?? 0) / 60);
  const goalMinutes = goal?.targetMinutes ?? Math.round(user.dailyStudyHours * 60);
  const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]));
  const initialSubject = params.subjectId
    ? subjectMap.get(params.subjectId)
    : undefined;
  const initialTopicId =
    initialSubject && initialSubject.topics.some((topic) => topic.id === params.topicId)
      ? params.topicId
      : undefined;

  return (
    <div>
      <PageHeader
        eyebrow="Pomodoro, but honest"
        title="Focus timer"
        description="Pick a rhythm, choose what you're studying, and let the minutes land somewhere real. Breaks stay XP-free on purpose."
        action={
          <>
            <span className="chip chip-amber">
              <Flame size={12} />
              {user.streak} day streak
            </span>
            <span className="chip chip-mint">
              <Timer size={12} />
              {formatMinutes(weekMinutes)} this week
            </span>
          </>
        }
      />

      <FocusTimer
        subjects={subjects.map((subject) => ({
          id: subject.id,
          name: subject.name,
          color: subject.color,
          topics: subject.topics,
        }))}
        todayMinutes={todayMinutes}
        todaySessions={completedToday.length}
        goalMinutes={goalMinutes}
        initialSubjectId={initialSubject?.id}
        initialTopicId={initialTopicId}
      />

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="glass card p-5">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Today&apos;s sessions</p>
            <span className="text-xs text-muted">{sessionsToday.length} logged</span>
          </div>

          {sessionsToday.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-muted">
              No sessions yet today. The first one is always the hardest — try 15 minutes.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {sessionsToday.map((session) => {
                const subject = session.subjectId ? subjectMap.get(session.subjectId) : null;
                const minutes = Math.round(session.focusSeconds / 60);
                return (
                  <div
                    key={session.id}
                    className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5"
                  >
                    <span
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
                      style={{ background: `${colorVar(subject?.color ?? "mint")}1f` }}
                    >
                      {session.completed ? (
                        <Zap size={14} style={{ color: colorVar(subject?.color ?? "mint") }} />
                      ) : (
                        <Coffee size={14} className="text-muted" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-cream">
                        {session.label}
                      </p>
                      <p className="text-[0.62rem] text-muted">
                        {subject?.name ?? "General"} ·{" "}
                        {session.startedAt.toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-cream">{minutes}m</p>
                      <p className="text-[0.6rem] text-muted">
                        {session.completed ? `+${Math.max(2, Math.round(minutes / 2.5))} XP` : "not counted"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="glass card p-5">
          <p className="eyebrow">A gentler way to focus</p>
          <div className="mt-3 space-y-3 text-xs text-muted">
            <p>
              <span className="font-semibold text-cream">1. Choose one topic.</span> Switching
              topics mid-block is the quiet killer of deep work.
            </p>
            <p>
              <span className="font-semibold text-cream">2. Put the phone out of reach.</span> Not
              face-down on the desk. Actually away.
            </p>
            <p>
              <span className="font-semibold text-cream">3. Take the break.</span> A 5-minute walk
              beats 5 minutes of scrolling for the next block.
            </p>
            <p>
              <span className="font-semibold text-cream">4. Log it honestly.</span> If you only
              managed 10 minutes, that is still 10 more than zero.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
