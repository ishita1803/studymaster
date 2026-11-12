"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Coffee,
  Flame,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Sparkles,
  Timer as TimerIcon,
  Zap,
} from "lucide-react";
import { Nova } from "@/components/nova";
import { logFocusSessionAction } from "@/lib/actions/focus";
import { XP_RULES } from "@/lib/gamification";
import { cn, colorVar } from "@/lib/utils";

type SubjectOption = {
  id: string;
  name: string;
  color: string;
  topics: { id: string; name: string }[];
};

const PRESETS = [
  { id: "classic", label: "25 / 5", focus: 25, break: 5, note: "Classic pomodoro" },
  { id: "deep", label: "50 / 10", focus: 50, break: 10, note: "Deep work" },
  { id: "sprint", label: "15 / 3", focus: 15, break: 3, note: "Low energy" },
  { id: "custom", label: "Custom", focus: 25, break: 5, note: "Your rhythm" },
] as const;

function playChime() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    [660, 880, 1320].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.08, now + index * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.12 + 0.35);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now + index * 0.12);
      oscillator.stop(now + index * 0.12 + 0.4);
    });
    setTimeout(() => void ctx.close(), 1400);
  } catch {
    // Sound is a nice-to-have; never break the timer over it.
  }
}

const RESUME_KEY = "sm:resume:focus";

export function FocusTimer({
  subjects,
  todayMinutes,
  todaySessions,
  goalMinutes,
  initialSubjectId,
  initialTopicId,
}: {
  subjects: SubjectOption[];
  todayMinutes: number;
  todaySessions: number;
  goalMinutes: number;
  initialSubjectId?: string;
  initialTopicId?: string;
}) {
  const router = useRouter();
  const [preset, setPreset] = useState<(typeof PRESETS)[number]["id"]>("classic");
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [phase, setPhase] = useState<"focus" | "break">("focus");
  const [remaining, setRemaining] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [cycles, setCycles] = useState(0);
  const [subjectId, setSubjectId] = useState(initialSubjectId ?? subjects[0]?.id ?? "");
  const [topicId, setTopicId] = useState(initialTopicId ?? "");
  const [celebration, setCelebration] = useState<string | null>(null);
  const [resumed, setResumed] = useState(false);
  const [logging, startLogging] = useTransition();
  const completedRef = useRef<number | null>(null);
  const restoredRef = useRef(false);

  const selectedSubject = subjects.find((subject) => subject.id === subjectId);
  const topics = selectedSubject?.topics ?? [];
  const selectedTopicName = topics.find((topic) => topic.id === topicId)?.name ?? "";
  const totalSeconds = (phase === "focus" ? focusMinutes : breakMinutes) * 60;
  const progress = totalSeconds > 0 ? ((totalSeconds - remaining) / totalSeconds) * 100 : 0;

  // Restore a paused session once, after hydration. The timer deliberately
  // comes back paused so a tab left open overnight does not log phantom work.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = window.localStorage.getItem(RESUME_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Record<string, unknown>;
      if (!saved || typeof saved !== "object") return;

      const savedPreset = String(saved.preset ?? "");
      if (PRESETS.some((entry) => entry.id === savedPreset)) {
        setPreset(savedPreset as (typeof PRESETS)[number]["id"]);
      }
      const savedFocus = Number(saved.focusMinutes);
      const savedBreak = Number(saved.breakMinutes);
      const savedRemaining = Number(saved.remaining);
      if (Number.isFinite(savedFocus) && savedFocus >= 1 && savedFocus <= 180) {
        setFocusMinutes(savedFocus);
      }
      if (Number.isFinite(savedBreak) && savedBreak >= 1 && savedBreak <= 60) {
        setBreakMinutes(savedBreak);
      }
      if (saved.phase === "break") setPhase("break");
      if (Number.isFinite(savedRemaining) && savedRemaining > 0) {
        setRemaining(Math.round(savedRemaining));
      }
      if (Number.isFinite(Number(saved.cycles)) && Number(saved.cycles) >= 0) {
        setCycles(Number(saved.cycles));
      }

      const savedSubject = String(saved.subjectId ?? "");
      const subject = initialSubjectId ?? savedSubject;
      if (subjects.some((entry) => entry.id === subject)) setSubjectId(subject);
      const savedTopic = String(saved.topicId ?? "");
      const nextSubject = subjects.find((entry) => entry.id === subject);
      const topic = initialTopicId ?? savedTopic;
      if (nextSubject?.topics.some((entry) => entry.id === topic)) setTopicId(topic);

      setRunning(false);
      setEndsAt(null);
      setResumed(true);
      window.setTimeout(() => setResumed(false), 5000);
    } catch {
      // A corrupt resume entry should never block the timer.
    }
  }, [initialSubjectId, initialTopicId, subjects]);

  // Persist the current timer every second and whenever the page is hidden.
  const stateRef = useRef({ preset, focusMinutes, breakMinutes, phase, remaining, cycles, subjectId, topicId });
  stateRef.current = { preset, focusMinutes, breakMinutes, phase, remaining, cycles, subjectId, topicId };

  useEffect(() => {
    function save() {
      try {
        window.localStorage.setItem(
          RESUME_KEY,
          JSON.stringify({ ...stateRef.current, savedAt: Date.now() }),
        );
      } catch {
        // Storage can be unavailable in private mode; ignore it.
      }
    }
    function onVisibility() {
      if (document.visibilityState === "hidden") save();
    }
    const interval = window.setInterval(() => {
      if (stateRef.current.remaining > 0) save();
    }, 1000);
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const radius = 130;
  const circumference = 2 * Math.PI * radius;

  const logSession = useCallback(
    (minutes: number) => {
      const formData = new FormData();
      formData.set("focusSeconds", String(minutes * 60));
      formData.set("plannedMinutes", String(focusMinutes));
      formData.set("subjectId", subjectId);
      formData.set("topicId", topicId);
      formData.set(
        "label",
        selectedTopicName || selectedSubject?.name || "Focus session",
      );

      startLogging(async () => {
        const result = await logFocusSessionAction(formData);
        if (result?.ok) {
          setCelebration(`+${result.xp ?? 0} XP · ${minutes} focused minutes`);
        }
        router.refresh();
        setTimeout(() => setCelebration(null), 6000);
      });
    },
    [focusMinutes, router, selectedSubject?.name, selectedTopicName, subjectId, topicId],
  );

  useEffect(() => {
    if (!running || !endsAt) return;

    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(left);

      if (left <= 0 && completedRef.current !== endsAt) {
        completedRef.current = endsAt;
        setRunning(false);
        setEndsAt(null);
        playChime();

        if (phase === "focus") {
          logSession(focusMinutes);
          setCycles((value) => value + 1);
          setPhase("break");
          setRemaining(breakMinutes * 60);
        } else {
          setPhase("focus");
          setRemaining(focusMinutes * 60);
        }
      }
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [running, endsAt, phase, focusMinutes, breakMinutes, logSession]);

  function applyPreset(id: (typeof PRESETS)[number]["id"]) {
    setPreset(id);
    const chosen = PRESETS.find((entry) => entry.id === id);
    if (!chosen || id === "custom") return;
    setFocusMinutes(chosen.focus);
    setBreakMinutes(chosen.break);
    setPhase("focus");
    setRemaining(chosen.focus * 60);
    setRunning(false);
    setEndsAt(null);
  }

  function toggle() {
    if (running) {
      setRunning(false);
      setEndsAt(null);
      return;
    }
    setEndsAt(Date.now() + remaining * 1000);
    setRunning(true);
  }

  function reset() {
    setRunning(false);
    setEndsAt(null);
    setPhase("focus");
    setRemaining(focusMinutes * 60);
    setCelebration(null);
    setResumed(false);
    try {
      window.localStorage.removeItem(RESUME_KEY);
    } catch {
      // Ignore unavailable storage.
    }
  }

  function skip() {
    setRunning(false);
    setEndsAt(null);
    setPhase("focus");
    setRemaining(focusMinutes * 60);
  }

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const display = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const goalProgress = Math.min(100, Math.round((todayMinutes / Math.max(1, goalMinutes)) * 100));

  return (
    <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
      <div className="glass card relative overflow-hidden p-5 sm:p-7">
        <div className="absolute -left-20 -top-24 h-64 w-64 rounded-full bg-mint/10 blur-3xl" />
        <div className="absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-violet/10 blur-3xl" />

        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="chip chip-mint">
                <TimerIcon size={12} />
                {phase === "focus" ? "Focus" : "Break"} · {preset === "custom" ? "custom" : preset}
              </span>
              {resumed ? (
                <span className="chip chip-amber">
                  <RotateCcw size={11} />
                  Resumed your last timer
                </span>
              ) : null}
              {cycles > 0 ? (
                <span className="chip">
                  <Flame size={11} className="text-amber" />
                  {cycles} cycle{cycles === 1 ? "" : "s"} today
                </span>
              ) : null}
            </div>
            <span className="chip chip-violet">
              <Zap size={11} />
              ~{XP_RULES.focus(focusMinutes)} XP
            </span>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {PRESETS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => applyPreset(entry.id)}
                disabled={running}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition disabled:opacity-50",
                  preset === entry.id
                    ? "border-mint/50 bg-mint/15 text-mint"
                    : "border-white/10 bg-white/[0.03] text-muted hover:border-white/25 hover:text-cream",
                )}
                title={entry.note}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {preset === "custom" ? (
            <div className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl border border-white/8 bg-white/[0.02] p-3">
              <div className="w-28">
                <label className="label">Focus (min)</label>
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={focusMinutes}
                  disabled={running}
                  onChange={(event) => {
                    const value = Math.min(180, Math.max(1, Number(event.target.value) || 1));
                    setFocusMinutes(value);
                    setPhase("focus");
                    setRemaining(value * 60);
                  }}
                  className="input text-sm"
                />
              </div>
              <div className="w-28">
                <label className="label">Break (min)</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={breakMinutes}
                  disabled={running}
                  onChange={(event) => {
                    const value = Math.min(60, Math.max(1, Number(event.target.value) || 1));
                    setBreakMinutes(value);
                  }}
                  className="input text-sm"
                />
              </div>
              <p className="pb-2 text-[0.68rem] text-muted">
                Nova logs the focus block only — breaks are for you.
              </p>
            </div>
          ) : null}

          <div className="mt-6 flex flex-col items-center">
            <div className="relative" style={{ width: "min(320px, 78vw)", aspectRatio: "1" }}>
              <svg viewBox="0 0 300 300" className="h-full w-full -rotate-90">
                <defs>
                  <linearGradient id="timer-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={phase === "focus" ? "#5BF0C8" : "#7DD3FC"} />
                    <stop offset="100%" stopColor={phase === "focus" ? "#A78BFA" : "#5BF0C8"} />
                  </linearGradient>
                </defs>
                <circle
                  cx="150"
                  cy="150"
                  r={radius}
                  fill="none"
                  stroke="rgba(255,255,255,0.07)"
                  strokeWidth="10"
                />
                <circle
                  cx="150"
                  cy="150"
                  r={radius}
                  fill="none"
                  stroke="url(#timer-gradient)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - progress / 100)}
                  style={{
                    filter:
                      phase === "focus"
                        ? "drop-shadow(0 0 9px rgba(91,240,200,0.55))"
                        : "drop-shadow(0 0 9px rgba(125,211,252,0.5))",
                    transition: "stroke-dashoffset 0.3s linear",
                  }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <p className="display text-5xl font-semibold tabular-nums text-cream sm:text-6xl">
                  {display}
                </p>
                <p className="mt-1 text-[0.7rem] uppercase tracking-[0.18em] text-muted">
                  {phase === "focus" ? "stay with it" : "breathe, stretch"}
                </p>
                <div className="mt-3 flex items-center gap-1.5">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <span
                      key={index}
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        index < cycles % 4 ? "bg-mint" : "bg-white/15",
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
              <button type="button" onClick={toggle} className="btn btn-primary btn-lg min-w-[140px]">
                {running ? <Pause size={17} /> : <Play size={17} />}
                {running ? "Pause" : remaining < totalSeconds ? "Resume" : "Start"}
              </button>
              <button type="button" onClick={reset} className="btn btn-secondary" aria-label="Reset timer">
                <RotateCcw size={15} />
                Reset
              </button>
              {phase === "break" ? (
                <button type="button" onClick={skip} className="btn btn-ghost">
                  <SkipForward size={15} />
                  Skip break
                </button>
              ) : null}
            </div>

            {logging ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-muted">
                <Loader2 size={13} className="animate-spin" />
                Saving your session…
              </p>
            ) : null}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="focus-subject">
                Subject
              </label>
              <select
                id="focus-subject"
                value={subjectId}
                onChange={(event) => {
                  setSubjectId(event.target.value);
                  setTopicId("");
                }}
                className="select"
              >
                <option value="">No subject</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="focus-topic">
                Topic (optional)
              </label>
              <select
                id="focus-topic"
                value={topicId}
                onChange={(event) => setTopicId(event.target.value)}
                className="select"
                disabled={topics.length === 0}
              >
                <option value="">General focus</option>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedSubject ? (
            <p className="mt-3 flex items-center gap-1.5 text-[0.68rem] text-muted">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: colorVar(selectedSubject.color) }}
              />
              Minutes land on {selectedSubject.name}
              {topicId ? " · this topic" : ""}
            </p>
          ) : null}
        </div>

        {celebration ? (
          <div className="absolute inset-x-4 bottom-4 z-10 flex items-center gap-3 rounded-2xl border border-mint/30 bg-ink/90 px-4 py-3 backdrop-blur-xl">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-mint text-ink">
              <Check size={17} strokeWidth={3} />
            </span>
            <div>
              <p className="text-sm font-semibold text-cream">Session logged</p>
              <p className="text-[0.68rem] text-mint">{celebration}</p>
            </div>
            <Nova size={34} mood="excited" className="ml-auto" />
          </div>
        ) : null}
      </div>

      <div className="space-y-5">
        <div className="glass card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Today</p>
              <h2 className="display mt-1 text-lg font-semibold text-cream">
                {todayMinutes} focused minutes
              </h2>
            </div>
            <Nova size={44} mood={goalProgress >= 100 ? "excited" : "focused"} />
          </div>

          <div className="mt-4">
            <div className="flex justify-between text-xs text-muted">
              <span>Daily goal</span>
              <span className="text-cream">
                {todayMinutes} / {goalMinutes} min
              </span>
            </div>
            <div className="progress-track mt-2">
              <div className="progress-fill" style={{ width: `${goalProgress}%` }} />
            </div>
            <p className="mt-2 text-[0.68rem] text-muted">
              {goalProgress >= 100
                ? "Goal met. Anything else is a bonus — rest is productive too."
                : `${goalMinutes - todayMinutes} minutes left. Two short sessions would do it.`}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
              <p className="text-[0.62rem] uppercase tracking-[0.14em] text-muted">Sessions</p>
              <p className="display text-lg font-semibold text-cream">{todaySessions}</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
              <p className="text-[0.62rem] uppercase tracking-[0.14em] text-muted">XP today</p>
              <p className="display text-lg font-semibold text-cream">
                {XP_RULES.focus(todayMinutes)}
              </p>
            </div>
          </div>
        </div>

        <div className="glass card p-5">
          <p className="eyebrow">How the timer behaves</p>
          <ul className="mt-3 space-y-2.5 text-xs text-muted">
            <li className="flex items-start gap-2">
              <Coffee size={14} className="mt-0.5 shrink-0 text-sky" />
              Break time never earns XP. It exists so the next block is sharper.
            </li>
            <li className="flex items-start gap-2">
              <Sparkles size={14} className="mt-0.5 shrink-0 text-mint" />
              Complete at least 80% of a block and it counts as a real session.
            </li>
            <li className="flex items-start gap-2">
              <Flame size={14} className="mt-0.5 shrink-0 text-amber" />
              Focus minutes feed your streak, readiness score and weak-topic plan.
            </li>
          </ul>
        </div>

        <div className="rounded-2xl border border-white/6 bg-white/[0.02] px-4 py-3 text-[0.68rem] text-muted">
          <span className="font-semibold text-cream">Accessibility:</span> the timer keeps running
          if you switch tabs, and uses the real clock so it never drifts.
        </div>
      </div>
    </div>
  );
}
