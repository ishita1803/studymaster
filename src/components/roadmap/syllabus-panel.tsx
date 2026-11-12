"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, CalendarDays, ChevronDown, Plus, Sparkles } from "lucide-react";
import {
  createSubjectAction,
  createTopicAction,
  deleteAllTopicsAction,
  deleteSubjectAction,
  deleteTopicAction,
  updateSubjectAction,
  updateTopicAction,
} from "@/lib/actions/subjects";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { cn, colorVar, examCountdown, SUBJECT_COLORS } from "@/lib/utils";

type Topic = {
  id: string;
  name: string;
  status: string;
  difficulty: number;
  importance: number;
  estimatedMinutes: number;
  masteryScore: number;
};

type Subject = {
  id: string;
  name: string;
  color: string;
  examDate: Date | string | null;
  importance: number;
  difficulty: number;
  prepLevel: string;
  syllabusApproved: boolean;
  topics: Topic[];
};

const STATUSES = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "studied", label: "Studied" },
  { value: "revised", label: "Revised" },
  { value: "mastered", label: "Mastered" },
];

const STATUS_CHIP: Record<string, string> = {
  not_started: "chip",
  in_progress: "chip chip-sky",
  studied: "chip chip-violet",
  revised: "chip chip-amber",
  mastered: "chip chip-mint",
};

export function SyllabusPanel({ subjects }: { subjects: Subject[] }) {
  const [addingSubject, setAddingSubject] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Your syllabus</p>
          <p className="display mt-1 text-lg font-semibold text-cream">
            {subjects.length} subject{subjects.length === 1 ? "" : "s"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddingSubject((value) => !value)}
          className="btn btn-secondary btn-sm"
        >
          <Plus size={13} />
          Subject
        </button>
      </div>

      {addingSubject ? (
        <form
          action={async (formData) => {
            await createSubjectAction(formData);
            setAddingSubject(false);
          }}
          className="space-y-3 rounded-2xl border border-mint/20 bg-mint/[0.05] p-4"
        >
          <div>
            <label className="label" htmlFor="new-subject-name">
              Subject name
            </label>
            <input
              id="new-subject-name"
              name="name"
              required
              placeholder="Organic chemistry"
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="new-subject-description">
              Description (optional)
            </label>
            <input
              id="new-subject-description"
              name="description"
              placeholder="What this subject covers"
              className="input"
              maxLength={500}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label" htmlFor="new-subject-importance">
                Importance
              </label>
              <select id="new-subject-importance" name="importance" className="select" defaultValue={3}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value} / 5
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="new-subject-difficulty">
                Difficulty
              </label>
              <select
                id="new-subject-difficulty"
                name="difficulty"
                className="select"
                defaultValue={3}
              >
                <option value={1}>Easy</option>
                <option value={2}>Easy+</option>
                <option value={3}>Moderate</option>
                <option value={4}>Difficult</option>
                <option value={5}>Very difficult</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="new-subject-prep">
                Preparation
              </label>
              <select
                id="new-subject-prep"
                name="prepLevel"
                className="select"
                defaultValue="intermediate"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
          </div>
          <div>
            <span className="label">Colour</span>
            <div className="flex items-center gap-2 pt-1">
              {SUBJECT_COLORS.map((color, index) => (
                <label key={color} className="cursor-pointer">
                  <input
                    type="radio"
                    name="color"
                    value={color}
                    defaultChecked={index === 0}
                    className="peer sr-only"
                  />
                  <span
                    className="block h-6 w-6 rounded-full border-2 border-transparent transition peer-checked:scale-110 peer-checked:border-cream"
                    style={{ background: colorVar(color) }}
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary btn-sm">
              <Sparkles size={13} />
              Add & re-plan
            </button>
            <button
              type="button"
              onClick={() => setAddingSubject(false)}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {subjects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center">
          <BookOpen size={20} className="mx-auto text-muted" />
          <p className="mt-2 text-xs text-muted">
            Add a subject as a container for notes, cards and tests. It only enters the
            roadmap once a dated test selects its topics.
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        {subjects.map((subject) => (
          <SubjectCard key={subject.id} subject={subject} />
        ))}
      </div>
    </div>
  );
}

function SubjectCard({ subject }: { subject: Subject }) {
  const countdown = examCountdown(subject.examDate ? new Date(subject.examDate) : null);
  const mastered = subject.topics.filter((topic) => topic.status === "mastered").length;
  const [addingTopic, setAddingTopic] = useState(false);

  return (
    <details className="group rounded-2xl border border-white/8 bg-white/[0.025] open:border-white/14 open:bg-white/[0.04]">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3.5 py-3">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: colorVar(subject.color) }}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-cream">{subject.name}</span>
          <span className="block text-[0.62rem] text-muted">
            {subject.topics.length} topic{subject.topics.length === 1 ? "" : "s"} · {mastered} mastered
            {countdown ? ` · ${countdown.label}` : ""}
          </span>
        </span>
        {!subject.syllabusApproved ? (
          <span className="chip chip-amber shrink-0 text-[0.5rem]">review</span>
        ) : null}
        <span className="chip shrink-0 text-[0.5rem]">
          {subject.difficulty >= 5
            ? "Very difficult"
            : subject.difficulty >= 4
              ? "Difficult"
              : subject.difficulty >= 3
                ? "Moderate"
                : "Easy"}
        </span>
        <ChevronDown
          size={15}
          className="shrink-0 text-muted transition group-open:rotate-180"
        />
      </summary>

      <div className="space-y-2 border-t border-white/6 px-3.5 py-3">
        {subject.topics.length === 0 ? (
          <p className="text-[0.68rem] text-muted">
            No topics yet — upload notes or add topics. Only topics selected on a dated
            test are scheduled.
          </p>
        ) : (
          subject.topics.map((topic) => (
            <div
              key={topic.id}
              className="rounded-xl border border-white/6 bg-black/20 px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-xs font-semibold text-cream">{topic.name}</p>
                <span className={cn("shrink-0 text-[0.6rem]", STATUS_CHIP[topic.status] ?? "chip")}>
                  {STATUSES.find((status) => status.value === topic.status)?.label ?? topic.status}
                </span>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.6rem] text-muted">
                <span>Difficulty {topic.difficulty}/5</span>
                <span>·</span>
                <span>{topic.estimatedMinutes} min</span>
                <span>·</span>
                <span>Mastery {Math.round(topic.masteryScore)}%</span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <form action={updateTopicAction} className="flex items-center gap-1.5">
                  <input type="hidden" name="id" value={topic.id} />
                  <select
                    name="status"
                    defaultValue={topic.status}
                    className="select h-7 w-auto rounded-lg px-2 py-0 text-[0.65rem]"
                    aria-label={`Status for ${topic.name}`}
                  >
                    {STATUSES.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="btn btn-ghost btn-sm h-7 px-2 text-[0.65rem]">
                    Save
                  </button>
                </form>

                <ConfirmDeleteDialog
                  title={`Delete ${topic.name}`}
                  description="Removes this topic and its subtopics from the syllabus and roadmap. Quizzes, flashcards and study history are kept but detached."
                  itemId={topic.id}
                  deleteAction={deleteTopicAction}
                  className="btn btn-ghost btn-icon h-7 w-7 text-muted hover:text-pink"
                />
              </div>
            </div>
          ))
        )}

        {addingTopic ? (
          <form action={createTopicAction} className="space-y-2 rounded-xl bg-mint/[0.05] p-3">
            <input type="hidden" name="subjectId" value={subject.id} />
            <input
              name="name"
              required
              placeholder="Topic name"
              className="input h-9 text-xs"
              autoFocus
            />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="label text-[0.55rem]">Difficulty</label>
                <select name="difficulty" defaultValue={3} className="select h-8 py-0 text-xs">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label text-[0.55rem]">Importance</label>
                <select name="importance" defaultValue={3} className="select h-8 py-0 text-xs">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label text-[0.55rem]">Minutes</label>
                <input
                  name="estimatedMinutes"
                  type="number"
                  min={15}
                  max={600}
                  step={5}
                  defaultValue={60}
                  className="input h-8 py-0 text-xs"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary btn-sm">
                Add topic
              </button>
              <button
                type="button"
                onClick={() => setAddingTopic(false)}
                className="btn btn-ghost btn-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAddingTopic(true)}
            className="btn btn-ghost btn-sm w-full text-mint"
          >
            <Plus size={13} />
            Add topic
          </button>
        )}

        <form
          action={updateSubjectAction}
          className="flex flex-wrap items-end gap-1.5 border-t border-white/6 pt-2.5"
        >
          <input type="hidden" name="id" value={subject.id} />
          <input type="hidden" name="name" value={subject.name} />
          <input type="hidden" name="importance" value={subject.importance} />
          <label className="text-[0.55rem] text-muted">
            Difficulty
            <select
              name="difficulty"
              defaultValue={subject.difficulty}
              className="select mt-0.5 h-7 py-0 text-[0.65rem]"
            >
              <option value={1}>Easy</option>
              <option value={2}>Easy+</option>
              <option value={3}>Moderate</option>
              <option value={4}>Difficult</option>
              <option value={5}>Very difficult</option>
            </select>
          </label>
          <label className="text-[0.55rem] text-muted">
            Preparation
            <select
              name="prepLevel"
              defaultValue={subject.prepLevel}
              className="select mt-0.5 h-7 py-0 text-[0.65rem]"
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
          <button type="submit" className="btn btn-ghost btn-sm h-7 px-2 text-[0.6rem]">
            Save
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/6 pt-2.5">
          <span className="inline-flex items-center gap-1 text-[0.6rem] text-muted">
            <CalendarDays size={11} />
            {subject.examDate
              ? new Date(subject.examDate).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "No upcoming test"}
          </span>
          <div className="flex items-center gap-2">
            <Link
              href={`/subjects/${subject.id}`}
              className="btn btn-ghost btn-sm text-[0.65rem] text-mint"
            >
              <BookOpen size={11} />
              Open subject
            </Link>
            <ConfirmDeleteDialog
              title="Delete all topics"
              description="Removes every detected topic of this subject while keeping the subject, its documents, quizzes and flashcards. The roadmap is rebuilt without its work until a new syllabus is approved."
              itemId={subject.id}
              triggerLabel="Delete topics"
              className="btn btn-ghost btn-sm text-[0.65rem] text-muted hover:text-amber"
              deleteAction={deleteAllTopicsAction}
              fieldName="subjectId"
            />
            <ConfirmDeleteDialog
              title={`Delete ${subject.name}`}
              description="This permanently removes the subject with its syllabus, exams, quizzes, flashcards, notes and plan progress. This cannot be undone."
              itemId={subject.id}
              triggerLabel="Remove subject"
              className="btn btn-ghost btn-sm text-[0.65rem] hover:text-pink"
              deleteAction={deleteSubjectAction}
            />
          </div>
        </div>
      </div>
    </details>
  );
}
