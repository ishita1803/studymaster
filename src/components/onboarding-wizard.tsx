"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Nova } from "@/components/nova";
import { completeOnboardingAction } from "@/lib/actions/onboarding";
import { cn, SUBJECT_COLORS } from "@/lib/utils";

type SubjectDraft = {
  name: string;
  examDate: string;
  importance: number;
  difficulty: number;
  prepLevel: string;
  color: string;
  topics: string;
};

const STEPS = ["Rhythm", "Subjects", "Topics", "Review"];

function defaultExamDate() {
  const date = new Date();
  date.setDate(date.getDate() + 21);
  return date.toISOString().slice(0, 10);
}

export function OnboardingWizard({ name }: { name: string }) {
  const [step, setStep] = useState(0);
  const [hours, setHours] = useState(2);
  const [subjects, setSubjects] = useState<SubjectDraft[]>([
    {
      name: "",
      examDate: defaultExamDate(),
      importance: 4,
      difficulty: 3,
      prepLevel: "intermediate",
      color: "mint",
      topics: "",
    },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const totalTopics = useMemo(
    () =>
      subjects.reduce(
        (sum, subject) =>
          sum + subject.topics.split(",").map((topic) => topic.trim()).filter(Boolean).length,
        0,
      ),
    [subjects],
  );

  function updateSubject(index: number, patch: Partial<SubjectDraft>) {
    setSubjects((previous) =>
      previous.map((subject, i) => (i === index ? { ...subject, ...patch } : subject)),
    );
  }

  function addSubject() {
    setSubjects((previous) => [
      ...previous,
      {
        name: "",
        examDate: defaultExamDate(),
        importance: 3,
        difficulty: 3,
        prepLevel: "intermediate",
        color: SUBJECT_COLORS[previous.length % SUBJECT_COLORS.length],
        topics: "",
      },
    ]);
  }

  function removeSubject(index: number) {
    setSubjects((previous) => previous.filter((_, i) => i !== index));
  }

  function next() {
    setError(null);
    if (step === 1) {
      const valid = subjects.filter((subject) => subject.name.trim());
      if (valid.length === 0) {
        setError("Give at least one subject a name to continue.");
        return;
      }
    }
    setStep((current) => Math.min(STEPS.length - 1, current + 1));
  }

  function submit() {
    setError(null);
    const payload = {
      dailyStudyHours: hours,
      subjects: subjects
        .filter((subject) => subject.name.trim())
        .map((subject) => ({
          name: subject.name,
          examDate: subject.examDate || null,
          importance: subject.importance,
          difficulty: subject.difficulty,
          prepLevel: subject.prepLevel,
          color: subject.color,
          topics: subject.topics
            .split(",")
            .map((topic) => topic.trim())
            .filter(Boolean),
        })),
    };

    startTransition(async () => {
      const result = await completeOnboardingAction(JSON.stringify(payload));
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-14">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Nova size={46} mood="happy" />
          <div>
            <p className="eyebrow">Let&apos;s build your plan</p>
            <p className="display text-xl font-semibold text-cream">
              Hi {name.split(" ")[0]}, a few quick things
            </p>
          </div>
        </div>
        <span className="chip chip-mint">
          Step {step + 1} / {STEPS.length}
        </span>
      </div>

      <div className="mb-6 flex gap-2">
        {STEPS.map((label, index) => (
          <div key={label} className="flex-1">
            <div
              className={cn(
                "h-1.5 rounded-full transition-all",
                index <= step
                  ? "bg-gradient-to-r from-mint to-violet"
                  : "bg-white/10",
              )}
            />
            <p
              className={cn(
                "mt-2 text-[0.62rem] font-semibold uppercase tracking-[0.14em]",
                index <= step ? "text-mint" : "text-muted",
              )}
            >
              {label}
            </p>
          </div>
        ))}
      </div>

      <div className="glass card p-6 sm:p-8">
        {step === 0 ? (
          <div className="fade-up">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-mint/25 bg-mint/10 text-mint">
                <Clock size={20} />
              </span>
              <div>
                <h2 className="display text-2xl font-semibold text-cream">
                  How much time do you really have?
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Be honest — a plan built on 2 focused hours beats one built on a fantasy 6.
                  You can change this any time in settings.
                </p>
              </div>
            </div>

            <div className="mt-8 rounded-3xl border border-white/8 bg-black/20 p-6 text-center">
              <p className="display text-5xl font-semibold text-gradient-mint">
                {hours.toFixed(1)}
                <span className="ml-1 text-2xl text-muted">hours / day</span>
              </p>
              <input
                type="range"
                min={0.5}
                max={8}
                step={0.5}
                value={hours}
                onChange={(event) => setHours(Number(event.target.value))}
                className="mt-6 w-full accent-[#5BF0C8]"
                aria-label="Daily study hours"
              />
              <div className="mt-2 flex justify-between text-[0.65rem] text-muted">
                <span>30 min</span>
                <span>4 hours</span>
                <span>8 hours</span>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                { label: "Gentle", value: "1h", note: "one steady block" },
                { label: "Balanced", value: "2–3h", note: "most students" },
                { label: "Intense", value: "4h+", note: "exam crunch" },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setHours(Number(preset.value.replace(/[^0-9.]/g, "")) || 2)}
                  className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-left transition hover:border-mint/30"
                >
                  <p className="text-xs font-semibold text-cream">{preset.label}</p>
                  <p className="display text-lg text-mint">{preset.value}</p>
                  <p className="text-[0.62rem] text-muted">{preset.note}</p>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="fade-up">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-violet/25 bg-violet/10 text-violet">
                <CalendarDays size={20} />
              </span>
              <div>
                <h2 className="display text-2xl font-semibold text-cream">
                  What are you studying?
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Add up to 5 subjects. Exam dates are what make the roadmap smart — leave blank
                  if there is no deadline yet.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {subjects.map((subject, index) => (
                <div
                  key={index}
                  className="rounded-2xl border border-white/8 bg-white/[0.025] p-4"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{
                        background:
                          subject.color === "violet"
                            ? "#A78BFA"
                            : subject.color === "pink"
                              ? "#FF8FB1"
                              : subject.color === "amber"
                                ? "#FFD48A"
                                : subject.color === "sky"
                                  ? "#7DD3FC"
                                  : "#5BF0C8",
                      }}
                    />
                    <input
                      value={subject.name}
                      onChange={(event) => updateSubject(index, { name: event.target.value })}
                      placeholder={index === 0 ? "Biology" : "Another subject"}
                      className="input border-0 bg-transparent px-0 text-base font-semibold focus:bg-transparent focus:shadow-none"
                    />
                    {subjects.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeSubject(index)}
                        className="btn btn-ghost btn-icon h-8 w-8 text-muted hover:text-pink"
                        aria-label="Remove subject"
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="label">Exam date</label>
                      <input
                        type="date"
                        value={subject.examDate}
                        onChange={(event) =>
                          updateSubject(index, { examDate: event.target.value })
                        }
                        className="input text-xs"
                      />
                    </div>
                    <div>
                      <label className="label">Importance</label>
                      <select
                        value={subject.importance}
                        onChange={(event) =>
                          updateSubject(index, { importance: Number(event.target.value) })
                        }
                        className="select text-xs"
                      >
                        {[1, 2, 3, 4, 5].map((value) => (
                          <option key={value} value={value}>
                            {value} / 5
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Colour</label>
                      <div className="flex items-center gap-1.5 pt-2">
                        {SUBJECT_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => updateSubject(index, { color })}
                            aria-label={`Use ${color}`}
                            className={cn(
                              "h-6 w-6 rounded-full border-2 transition",
                              subject.color === color
                                ? "scale-110 border-cream"
                                : "border-transparent opacity-60 hover:opacity-100",
                            )}
                            style={{
                              background:
                                color === "violet"
                                  ? "#A78BFA"
                                  : color === "pink"
                                    ? "#FF8FB1"
                                    : color === "amber"
                                      ? "#FFD48A"
                                      : color === "sky"
                                        ? "#7DD3FC"
                                        : "#5BF0C8",
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="label">Difficulty</label>
                      <select
                        value={subject.difficulty}
                        onChange={(event) =>
                          updateSubject(index, { difficulty: Number(event.target.value) })
                        }
                        className="select text-xs"
                      >
                        <option value={1}>Easy</option>
                        <option value={2}>Easy+</option>
                        <option value={3}>Moderate</option>
                        <option value={4}>Difficult</option>
                        <option value={5}>Very difficult</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Preparation</label>
                      <select
                        value={subject.prepLevel}
                        onChange={(event) =>
                          updateSubject(index, { prepLevel: event.target.value })
                        }
                        className="select text-xs"
                      >
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {subjects.length < 5 ? (
              <button
                type="button"
                onClick={addSubject}
                className="btn btn-secondary btn-sm mt-4"
              >
                <Plus size={14} />
                Add another subject
              </button>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="fade-up">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-pink/25 bg-pink/10 text-pink">
                <Sparkles size={20} />
              </span>
              <div>
                <h2 className="display text-2xl font-semibold text-cream">Break it into topics</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Separate topics with commas. Rough is fine — Nova sets difficulty to 3 and you
                  can tune everything later.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {subjects
                .filter((subject) => subject.name.trim())
                .map((subject) => {
                  const index = subjects.indexOf(subject);
                  return (
                    <div key={index}>
                      <label className="label">{subject.name}</label>
                      <textarea
                        value={subject.topics}
                        onChange={(event) => updateSubject(index, { topics: event.target.value })}
                        rows={2}
                        placeholder="Cell division, Photosynthesis, Genetics, Ecology"
                        className="textarea min-h-[76px]"
                      />
                    </div>
                  );
                })}
            </div>

            <div className="mt-5 rounded-2xl border border-mint/20 bg-mint/[0.06] px-4 py-3 text-xs text-mint">
              {totalTopics > 0
                ? `${totalTopics} topic${totalTopics === 1 ? "" : "s"} ready to be scheduled.`
                : "No topics yet — you can add them any time from the roadmap."}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="fade-up">
            <div className="flex items-start gap-4">
              <Nova size={56} mood="excited" />
              <div>
                <h2 className="display text-2xl font-semibold text-cream">
                  Ready to plant, {name.split(" ")[0]}?
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Nova will spread your topics across {hours} hour{hours === 1 ? "" : "s"} a day,
                  reserve revision days before each exam, and keep two days flexible for life.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-2">
              {subjects
                .filter((subject) => subject.name.trim())
                .map((subject) => (
                  <div
                    key={subject.name}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-cream">{subject.name}</p>
                      <p className="text-[0.68rem] text-muted">
                        {subject.examDate
                          ? `Exam ${new Date(`${subject.examDate}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                          : "No exam date"}{" "}
                        ·{" "}
                        {subject.topics.split(",").filter((topic) => topic.trim()).length} topics
                      </p>
                    </div>
                    <Check size={16} className="text-mint" />
                  </div>
                ))}
            </div>

            <div className="mt-5 grid gap-2 text-xs text-muted sm:grid-cols-3">
              <div className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2">
                <span className="text-mint">Smart order</span> — hard & urgent first
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2">
                <span className="text-mint">Revision days</span> — built in automatically
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2">
                <span className="text-mint">Rescheduling</span> — one click when behind
              </div>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="mt-5 rounded-xl border border-pink/30 bg-pink/10 px-4 py-2.5 text-xs text-pink">
            {error}
          </p>
        ) : null}

        <div className="mt-8 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            className="btn btn-ghost"
            disabled={step === 0 || pending}
          >
            <ArrowLeft size={15} />
            Back
          </button>

          {step < STEPS.length - 1 ? (
            <button type="button" onClick={next} className="btn btn-primary">
              Continue
              <ArrowRight size={15} />
            </button>
          ) : (
            <button type="button" onClick={submit} className="btn btn-primary" disabled={pending}>
              {pending ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {pending ? "Building your roadmap…" : "Build my roadmap"}
            </button>
          )}
        </div>
      </div>

      <p className="mt-5 text-center text-[0.68rem] text-muted">
        You can change every subject, topic and hour later. Nothing is locked in.
      </p>
    </div>
  );
}
