"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ListChecks, Plus, Trash2 } from "lucide-react";
import {
  createExamAction,
  deleteExamAction,
  updateExamAction,
} from "@/lib/actions/exams";
import { PendingSubmit } from "@/components/ui/pending-progress";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { cn, colorVar, dateKey, daysBetween } from "@/lib/utils";

type TopicOption = { id: string; name: string; chapter: string };
type SubjectOption = {
  id: string;
  name: string;
  color: string;
  topics: TopicOption[];
};

type ExamRow = {
  id: string;
  name: string;
  date: Date | string;
  importance: number;
  difficulty: number;
  prepLevel: string;
  material: string;
  topicIds: string[];
  /** Saved 1–5 rating per selected topic (this exam only). */
  topicRatings: Record<string, string>;
  subject: { id: string; name: string; color: string };
};

/** Legacy exams may store "easy"/"medium"/"hard" — show them as 2/3/4. */
function normalizeLegacyRating(rating: string | undefined): string {
  if (rating === "easy") return "2";
  if (rating === "hard") return "4";
  if (rating === "medium") return "3";
  if (rating === "1" || rating === "2" || rating === "3" || rating === "4" || rating === "5") {
    return rating;
  }
  return "3";
}

const DIFFICULTY_LABEL: Record<number, string> = {
  1: "Easy",
  2: "Easy",
  3: "Moderate",
  4: "Difficult",
  5: "Very difficult",
};

const EMPTY_TOPICS: TopicOption[] = [];

function countdownLabel(value: Date | string) {
  const date = new Date(value);
  const days = daysBetween(new Date(), date);
  if (days <= 0) return { label: "today", urgent: true };
  if (days === 1) return { label: "tomorrow", urgent: true };
  return { label: `in ${days} days`, urgent: days <= 7 };
}

function groupTopics(topics: TopicOption[]) {
  const groups = new Map<string, TopicOption[]>();
  for (const topic of topics) {
    const key = topic.chapter.trim() || "Topics";
    groups.set(key, [...(groups.get(key) ?? []), topic]);
  }
  return [...groups.entries()];
}

function TopicChecklist({
  topics,
  selected,
  onChange,
  ratings,
}: {
  topics: TopicOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Saved Easy/Medium/Hard rating per topic for the edit form's defaults. */
  ratings?: Record<string, string>;
}) {
  const groups = useMemo(() => groupTopics(topics), [topics]);
  const allSelected = topics.length > 0 && topics.every((topic) => selected.has(topic.id));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  if (topics.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-amber/30 bg-amber/[0.06] px-2.5 py-2 text-[0.62rem] text-amber">
        This subject has no approved topics yet. Approve its syllabus first, then add
        the test.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-white/8 bg-black/20">
      <div className="flex items-center justify-between gap-2 border-b border-white/8 px-2.5 py-1.5">
        <span className="inline-flex items-center gap-1 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted">
          <ListChecks size={11} />
          Topics on this test
        </span>
        <button
          type="button"
          onClick={() => onChange(allSelected ? new Set() : new Set(topics.map((t) => t.id)))}
          className="text-[0.6rem] font-semibold text-mint hover:underline"
        >
          {allSelected ? "Clear all" : "Select all"}
        </button>
      </div>
      <div className="max-h-60 space-y-2 overflow-y-auto px-2.5 py-2">
        {groups.map(([chapter, entries]) => (
          <div key={chapter}>
            <p className="mb-1 text-[0.58rem] font-semibold uppercase tracking-[0.1em] text-muted/80">
              {chapter}
            </p>
            <div className="space-y-1">
              {entries.map((topic) => {
                const checked = selected.has(topic.id);
                return (
                  <div
                    key={topic.id}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-1 py-0.5 transition",
                      checked ? "bg-white/[0.05]" : "opacity-60",
                    )}
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 text-[0.68rem] text-cream/90 hover:bg-white/[0.04]">
                      <input
                        type="checkbox"
                        name="topicIds"
                        value={topic.id}
                        checked={checked}
                        onChange={() => toggle(topic.id)}
                        className="mt-0.5 h-3.5 w-3.5 accent-[var(--mint)]"
                      />
                      <span className="min-w-0">{topic.name}</span>
                    </label>
                    {/* Per-topic 1–5 difficulty rating, saved with THIS exam. */}
                    <select
                      name={`difficulty_${topic.id}`}
                      defaultValue={normalizeLegacyRating(ratings?.[topic.id])}
                      disabled={!checked}
                      title="How hard is this topic for you (1 = very easy, 5 = very hard)? Harder topics get more study time."
                      className="h-6 w-[5.6rem] rounded-md border border-white/10 bg-black/30 px-1 text-[0.58rem] text-cream disabled:opacity-40"
                    >
                      <option value="1">1 · Very easy</option>
                      <option value="2">2 · Easy</option>
                      <option value="3">3 · Moderate</option>
                      <option value="4">4 · Hard</option>
                      <option value="5">5 · Very hard</option>
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExamCard({
  exam,
  topics,
  today,
}: {
  exam: ExamRow;
  topics: TopicOption[];
  today: string;
}) {
  const [editing, setEditing] = useState(false);
  const initial = useMemo(
    () =>
      new Set(
        exam.topicIds.length > 0 ? exam.topicIds : topics.map((topic) => topic.id),
      ),
    [exam.topicIds, topics],
  );
  const [selected, setSelected] = useState<Set<string>>(initial);
  const countdown = countdownLabel(exam.date);
  const topicCount = exam.topicIds.length > 0 ? exam.topicIds.length : topics.length;

  return (
    <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-cream">{exam.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.6rem] text-muted">
            <span className="inline-flex items-center gap-1">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: colorVar(exam.subject.color) }}
              />
              {exam.subject.name}
            </span>
            <span>·</span>
            <span>
              {new Date(exam.date).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <span>·</span>
            <span
              className={cn(
                "font-semibold",
                countdown.urgent ? "text-pink" : "text-mint",
              )}
            >
              {countdown.label}
            </span>
            <span>·</span>
            <span>{DIFFICULTY_LABEL[exam.difficulty] ?? "Moderate"}</span>
            <span>·</span>
            <span className="capitalize">{exam.prepLevel}</span>
            <span>·</span>
            <span>
              {exam.topicIds.length === 0
                ? `all ${topicCount} topics`
                : `${topicCount} topic${topicCount === 1 ? "" : "s"}`}
            </span>
          </p>
          {exam.material ? (
            <p className="mt-0.5 line-clamp-1 text-[0.56rem] text-muted">
              Material: {exam.material}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            className="btn btn-ghost btn-sm h-7 px-2 text-[0.6rem]"
          >
            <ListChecks size={11} />
            Topics
          </button>
          <ConfirmDeleteDialog
            title={`Delete ${exam.name}`}
            description="Removes this exam and its topic selections. Your subjects, notes and study history stay. The roadmap is rebuilt for the remaining exams."
            itemId={exam.id}
            deleteAction={deleteExamAction}
            className="btn btn-ghost btn-icon h-7 w-7 text-muted hover:text-pink"
          />
        </div>
      </div>

      <form action={updateExamAction} className="mt-2 flex items-center gap-1.5">
        <input type="hidden" name="id" value={exam.id} />
        <input type="hidden" name="name" value={exam.name} />
        <input type="hidden" name="importance" value={exam.importance} />
        <CalendarDays size={11} className="shrink-0 text-muted" />
        <input
          name="date"
          type="date"
          defaultValue={dateKey(new Date(exam.date))}
          min={today}
          className="input h-7 flex-1 py-0 text-[0.65rem]"
          aria-label={`Change date for ${exam.name}`}
        />
        <PendingSubmit
          idleLabel="Save date"
          stages={["Saving the date…", "Re-planning revision days…"]}
          className="btn btn-ghost btn-sm h-7 px-2 text-[0.6rem]"
        />
      </form>

      {editing ? (
        <form action={updateExamAction} className="mt-2 space-y-2">
          <input type="hidden" name="id" value={exam.id} />
          <input type="hidden" name="topicSelection" value="1" />
          <TopicChecklist
            topics={topics}
            selected={selected}
            onChange={setSelected}
            ratings={exam.topicRatings}
          />
          <div className="flex gap-2">
            <PendingSubmit
              idleLabel="Save topics & plan"
              icon={<Check size={12} />}
              stages={["Saving the exam topics…", "Re-planning revision days…"]}
              className="btn btn-primary btn-sm"
            />
            <button
              type="button"
              onClick={() => {
                setSelected(initial);
                setEditing(false);
              }}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

export function ExamPlanner({
  subjects,
  exams,
}: {
  subjects: SubjectOption[];
  exams: ExamRow[];
}) {
  const [adding, setAdding] = useState(false);
  const [addSubjectId, setAddSubjectId] = useState(subjects[0]?.id ?? "");
  const [addSelected, setAddSelected] = useState<Set<string>>(
    () => new Set(subjects[0]?.topics.map((topic) => topic.id) ?? []),
  );
  const today = dateKey();

  const addTopics = useMemo(
    () =>
      subjects.find((subject) => subject.id === addSubjectId)?.topics ?? EMPTY_TOPICS,
    [subjects, addSubjectId],
  );

  // Default a new test to every approved topic of the chosen subject.
  useEffect(() => {
    setAddSelected(new Set(addTopics.map((topic) => topic.id)));
  }, [addTopics]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Tests &amp; exams</p>
          <p className="display mt-1 text-lg font-semibold text-cream">
            {exams.length === 0 ? "Nothing scheduled" : `${exams.length} upcoming`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((value) => !value)}
          className="btn btn-secondary btn-sm"
          disabled={subjects.length === 0}
        >
          <Plus size={13} />
          Test
        </button>
      </div>

      {subjects.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-[0.68rem] text-muted">
          Add a subject first, then you can schedule its tests.
        </p>
      ) : null}

      {adding ? (
        <form
          action={async (formData) => {
            await createExamAction(formData);
            setAdding(false);
          }}
          className="space-y-2.5 rounded-2xl border border-violet/20 bg-violet/[0.06] p-3.5"
        >
          <input type="hidden" name="topicSelection" value="1" />
          <div>
            <label className="label text-[0.6rem]" htmlFor="exam-name">
              Test name
            </label>
            <input
              id="exam-name"
              name="name"
              placeholder="Unit 3 test"
              className="input h-9 text-xs"
              maxLength={80}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label text-[0.6rem]" htmlFor="exam-subject">
                Subject
              </label>
              <select
                id="exam-subject"
                name="subjectId"
                required
                value={addSubjectId}
                onChange={(event) => setAddSubjectId(event.target.value)}
                className="select h-9 py-0 text-xs"
              >
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label text-[0.6rem]" htmlFor="exam-date">
                Date
              </label>
              <input
                id="exam-date"
                name="date"
                type="date"
                required
                min={today}
                className="input h-9 text-xs"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label text-[0.6rem]" htmlFor="exam-difficulty">
                Difficulty
              </label>
              <select
                id="exam-difficulty"
                name="difficulty"
                defaultValue={3}
                className="select h-9 py-0 text-xs"
              >
                <option value={1}>Easy</option>
                <option value={2}>Easy+</option>
                <option value={3}>Moderate</option>
                <option value={4}>Difficult</option>
                <option value={5}>Very difficult</option>
              </select>
            </div>
            <div>
              <label className="label text-[0.6rem]" htmlFor="exam-prep">
                Preparation
              </label>
              <select
                id="exam-prep"
                name="prepLevel"
                defaultValue="intermediate"
                className="select h-9 py-0 text-xs"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
          </div>
          <TopicChecklist
            topics={addTopics}
            selected={addSelected}
            onChange={setAddSelected}
          />
          <div>
            <label className="label text-[0.6rem]" htmlFor="exam-material">
              Available material (optional)
            </label>
            <input
              id="exam-material"
              name="material"
              placeholder="Lecture notes, textbook ch. 4, past papers"
              className="input h-9 text-xs"
              maxLength={300}
            />
          </div>
          <div>
            <label className="label text-[0.6rem]" htmlFor="exam-importance">
              Importance
            </label>
            <select
              id="exam-importance"
              name="importance"
              defaultValue={4}
              className="select h-9 py-0 text-xs"
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value} / 5
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <PendingSubmit
              idleLabel="Add & plan"
              icon={<Check size={12} />}
              stages={["Saving the exam…", "Building revision days…"]}
              className="btn btn-primary btn-sm"
            />
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {exams.length > 0 ? (
        <div className="space-y-2">
          {exams.map((exam) => (
            <ExamCard
              key={exam.id}
              exam={exam}
              topics={subjects.find((subject) => subject.id === exam.subject.id)?.topics ?? []}
              today={today}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-center text-[0.68rem] text-muted">
          Add every upcoming test — Nova reserves revision days before each one.
        </p>
      )}
    </div>
  );
}
