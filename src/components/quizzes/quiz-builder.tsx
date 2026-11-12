"use client";

import { useActionState, useMemo, useState } from "react";
import {
  ArrowRight,
  BrainCircuit,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { UploadField } from "@/components/files/upload-field";
import { PendingBar } from "@/components/ui/pending-progress";
import {
  createQuizAction,
  generateQuizAction,
  type QuizFormState,
} from "@/lib/actions/quizzes";
import {
  matchPairProblem,
  mcqOptionProblem,
  type QuizQuestionType,
} from "@/lib/quiz-rules";
import { cn } from "@/lib/utils";

type Subject = {
  id: string;
  name: string;
  topics: { id: string; name: string }[];
};

type Note = { id: string; title: string };

type MatchPairDraft = { left: string; right: string };

type QuestionDraft = {
  type: QuizQuestionType;
  prompt: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  pairs: MatchPairDraft[];
};

const initial: QuizFormState = {};

function emptyQuestion(type: QuizQuestionType = "mcq"): QuestionDraft {
  return {
    type,
    prompt: "",
    options: type === "mcq" ? ["", "", "", ""] : type === "truefalse" ? ["True", "False"] : [],
    correctAnswer: "",
    explanation: "",
    pairs:
      type === "match"
        ? [
            { left: "", right: "" },
            { left: "", right: "" },
            { left: "", right: "" },
          ]
        : [],
  };
}

export function QuizBuilder({
  subjects,
  notes,
  presetTopicId,
  presetSubjectId,
  presetTab = "ai",
  aiEnabled,
}: {
  subjects: Subject[];
  notes: Note[];
  presetTopicId?: string;
  presetSubjectId?: string;
  presetTab?: "ai" | "manual";
  aiEnabled: boolean;
}) {
  const [tab, setTab] = useState<"ai" | "manual">(presetTab);
  const [manualState, manualAction, manualPending] = useActionState(createQuizAction, initial);
  const [aiState, aiAction, aiPending] = useActionState(generateQuizAction, initial);

  const preset = useMemo(() => {
    for (const subject of subjects) {
      const topic = subject.topics.find((entry) => entry.id === presetTopicId);
      if (topic) return { subjectId: subject.id, topicId: topic.id };
    }
    if (presetSubjectId && subjects.some((subject) => subject.id === presetSubjectId)) {
      return { subjectId: presetSubjectId, topicId: "" };
    }
    return null;
  }, [subjects, presetTopicId, presetSubjectId]);

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("ai")}
          className={cn(
            "btn btn-sm",
            tab === "ai" ? "btn-primary" : "btn-secondary",
          )}
        >
          <Wand2 size={14} />
          Generate with Nova
        </button>
        <button
          type="button"
          onClick={() => setTab("manual")}
          className={cn(
            "btn btn-sm",
            tab === "manual" ? "btn-primary" : "btn-secondary",
          )}
        >
          <Plus size={14} />
          Build manually
        </button>
      </div>

      {tab === "ai" ? (
        <AiQuizForm
          subjects={subjects}
          notes={notes}
          action={aiAction}
          pending={aiPending}
          state={aiState}
          preset={preset}
          aiEnabled={aiEnabled}
        />
      ) : (
        <ManualQuizForm
          subjects={subjects}
          action={manualAction}
          pending={manualPending}
          state={manualState}
          preset={preset}
        />
      )}
    </div>
  );
}

function SubjectTopicFields({
  subjects,
  preset,
}: {
  subjects: Subject[];
  preset: { subjectId: string; topicId: string } | null;
}) {
  const [subjectId, setSubjectId] = useState(preset?.subjectId ?? "");
  const topics = subjects.find((subject) => subject.id === subjectId)?.topics ?? [];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="quiz-subject">
          Subject
        </label>
        <select
          id="quiz-subject"
          name="subjectId"
          value={subjectId}
          onChange={(event) => setSubjectId(event.target.value)}
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
        <label className="label" htmlFor="quiz-topic">
          Topic
        </label>
        <select
          id="quiz-topic"
          name="topicId"
          defaultValue={preset?.topicId ?? ""}
          key={subjectId}
          className="select"
          disabled={topics.length === 0}
        >
          <option value="">{topics.length === 0 ? "No topics" : "General"}</option>
          {topics.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {topic.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function AiQuizForm({
  subjects,
  notes,
  action,
  pending,
  state,
  preset,
  aiEnabled,
}: {
  subjects: Subject[];
  notes: Note[];
  action: (formData: FormData) => void;
  pending: boolean;
  state: QuizFormState;
  preset: { subjectId: string; topicId: string } | null;
  aiEnabled: boolean;
}) {
  return (
    <form action={action} className="glass card space-y-4 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-violet/25 bg-violet/10 text-violet">
          <Sparkles size={18} />
        </span>
        <div>
          <h2 className="display text-lg font-semibold text-cream">Nova builds the questions</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {aiEnabled
              ? "Gemini reads your notes or pasted material and writes a mixed quiz with explanations."
              : "Demo mode: Nova extracts key ideas locally. Add a Gemini key for richer, exam-style questions."}
          </p>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="ai-title">
          Quiz title (optional)
        </label>
        <input
          id="ai-title"
          name="title"
          placeholder="Cell division mock test"
          className="input"
        />
      </div>

      <SubjectTopicFields subjects={subjects} preset={preset} />

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="ai-count">
            Questions
          </label>
          <select id="ai-count" name="count" defaultValue={10} className="select">
            {[5, 10, 15, 20].map((value) => (
              <option key={value} value={value}>
                {value} questions
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="ai-difficulty">
            Difficulty
          </label>
          <select id="ai-difficulty" name="difficulty" defaultValue="medium" className="select">
            <option value="easy">Easy · facts &amp; definitions</option>
            <option value="medium">Medium · concepts &amp; application</option>
            <option value="hard">Hard · scenarios &amp; problems</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="ai-note">
            Use one of your notes
          </label>
          <select id="ai-note" name="noteId" className="select">
            <option value="">No note — use text or subject</option>
            {notes.map((note) => (
              <option key={note.id} value={note.id}>
                {note.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset>
        <legend className="label">Answer types</legend>
        <div className="flex flex-wrap gap-2 pt-1">
          {[
            { value: "mcq", label: "Multiple choice" },
            { value: "truefalse", label: "True / false" },
            { value: "match", label: "Match the following" },
            { value: "short", label: "Short answer" },
            { value: "long", label: "Long answer" },
            { value: "application", label: "Application-based" },
            { value: "problem", label: "Problem-solving" },
          ].map((type) => (
            <label
              key={type.value}
              className="chip cursor-pointer has-[:checked]:chip-mint"
            >
              <input
                type="checkbox"
                name="questionTypes"
                value={type.value}
                defaultChecked={["mcq", "truefalse", "short"].includes(type.value)}
                className="sr-only"
              />
              {type.label}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-[0.62rem] text-muted">
          Nova only writes the answer types you tick. Leave at least one selected.
        </p>
      </fieldset>

      <fieldset>
        <legend className="label">Question styles</legend>
        <div className="flex flex-wrap gap-2 pt-1">
          {[
            { value: "conceptual", label: "Conceptual" },
            { value: "definition", label: "Definitions" },
            { value: "application", label: "Application" },
            { value: "scenario", label: "Scenarios" },
            { value: "comparison", label: "Comparison" },
            { value: "problem", label: "Problem solving" },
            { value: "formula", label: "Formulas" },
            { value: "factual", label: "Facts" },
          ].map((format) => (
            <label
              key={format.value}
              className="chip cursor-pointer has-[:checked]:chip-mint"
            >
              <input
                type="checkbox"
                name="formats"
                value={format.value}
                defaultChecked
                className="sr-only"
              />
              {format.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label className="label" htmlFor="ai-source">
          Or paste material
        </label>
        <textarea
          id="ai-source"
          name="source"
          rows={6}
          placeholder="Paste a paragraph from your textbook, a lecture summary, or your own notes…"
          className="textarea"
        />
        <p className="mt-1.5 text-[0.65rem] text-muted">
          Leave blank and Nova will use the subject&apos;s topic list as a starting point.
        </p>
      </div>

      <UploadField
        id="ai-file"
        hint="Or upload a document, a scanned PDF, or a photo of handwritten notes. Its text is added to the material above."
      />

      {state.error ? (
        <p className="rounded-xl border border-pink/30 bg-pink/10 px-4 py-2.5 text-xs text-pink">
          {state.error}
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? <Loader2 size={16} className="animate-spin" /> : <BrainCircuit size={16} />}
        {pending ? "Writing questions…" : "Generate quiz"}
        {!pending ? <ArrowRight size={15} /> : null}
      </button>
      <PendingBar
        pending={pending}
        stages={[
          "Reading source material…",
          "Choosing question types…",
          "Writing questions…",
          "Saving the quiz…",
        ]}
        className="!mt-0"
      />
    </form>
  );
}

function ManualQuizForm({
  subjects,
  action,
  pending,
  state,
  preset,
}: {
  subjects: Subject[];
  action: (formData: FormData) => void;
  pending: boolean;
  state: QuizFormState;
  preset: { subjectId: string; topicId: string } | null;
}) {
  const [title, setTitle] = useState("");
  const [timeLimit, setTimeLimit] = useState(0);
  const [questions, setQuestions] = useState<QuestionDraft[]>([emptyQuestion()]);

  function update(index: number, patch: Partial<QuestionDraft>) {
    setQuestions((previous) =>
      previous.map((question, i) => (i === index ? { ...question, ...patch } : question)),
    );
  }

  function changeType(index: number, type: QuizQuestionType) {
    const next = emptyQuestion(type);
    update(index, {
      type,
      options: next.options,
      pairs: next.pairs,
      correctAnswer: "",
    });
  }

  function updatePair(
    index: number,
    pairIndex: number,
    patch: Partial<MatchPairDraft>,
  ) {
    setQuestions((previous) =>
      previous.map((question, i) => {
        if (i !== index) return question;
        const pairs = question.pairs.map((pair, position) =>
          position === pairIndex ? { ...pair, ...patch } : pair,
        );
        return { ...question, pairs };
      }),
    );
  }

  function addPair(index: number) {
    setQuestions((previous) =>
      previous.map((question, i) =>
        i === index
          ? { ...question, pairs: [...question.pairs, { left: "", right: "" }] }
          : question,
      ),
    );
  }

  function removePair(index: number, pairIndex: number) {
    setQuestions((previous) =>
      previous.map((question, i) =>
        i === index
          ? {
              ...question,
              pairs: question.pairs.filter((_, position) => position !== pairIndex),
            }
          : question,
      ),
    );
  }

  type PayloadQuestion = {
    type: QuizQuestionType;
    prompt: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
    pairs?: MatchPairDraft[];
  };

  const payload = JSON.stringify(
    questions
      .map((question): PayloadQuestion => {
        const prompt = question.prompt.trim();
        const explanation = question.explanation.trim();

        if (question.type === "match") {
          const pairs = question.pairs
            .map((pair) => ({ left: pair.left.trim(), right: pair.right.trim() }))
            .filter((pair) => pair.left && pair.right);
          return {
            type: question.type,
            prompt,
            options: pairs.map((pair) => pair.right),
            correctAnswer: JSON.stringify(pairs),
            pairs,
            explanation,
          };
        }

        return {
          type: question.type,
          prompt,
          options:
            question.type === "mcq"
              ? question.options.map((option) => option.trim()).filter(Boolean)
              : question.type === "truefalse"
                ? ["True", "False"]
                : [],
          correctAnswer: question.correctAnswer.trim(),
          explanation,
        };
      })
      .filter((question) =>
        question.type === "match"
          ? question.prompt && (question.pairs?.length ?? 0) >= 2
          : question.prompt && question.correctAnswer,
      ),
  );

  const problems = questions.map((question) => {
    if (!question.prompt.trim()) return "Add a question prompt.";
    if (question.type === "mcq") {
      return mcqOptionProblem(question.options, question.correctAnswer);
    }
    if (question.type === "match") {
      return matchPairProblem(question.pairs);
    }
    if (question.type === "truefalse" && !["True", "False"].includes(question.correctAnswer)) {
      return "Mark whether the statement is true or false.";
    }
    if (!question.correctAnswer.trim()) {
      return "Write a model answer or marking guide.";
    }
    return null;
  });
  const hasProblems = problems.some(Boolean);

  return (
    <form action={action} className="space-y-4">
      <div className="glass card space-y-4 p-5 sm:p-6">
        <div>
          <label className="label" htmlFor="manual-title">
            Quiz title
          </label>
          <input
            id="manual-title"
            name="title"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Photosynthesis checkpoint"
            className="input"
          />
        </div>

        <SubjectTopicFields subjects={subjects} preset={preset} />

        <div>
          <label className="label" htmlFor="manual-difficulty">
            Difficulty
          </label>
          <select
            id="manual-difficulty"
            name="difficulty"
            defaultValue="medium"
            className="select"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>

        <div>
          <label className="label" htmlFor="manual-limit">
            Time limit (optional)
          </label>
          <select
            id="manual-limit"
            name="timeLimit"
            value={timeLimit}
            onChange={(event) => setTimeLimit(Number(event.target.value))}
            className="select"
          >
            <option value={0}>No timer</option>
            <option value={300}>5 minutes</option>
            <option value={600}>10 minutes</option>
            <option value={900}>15 minutes</option>
            <option value={1800}>30 minutes</option>
            <option value={3600}>60 minutes</option>
          </select>
        </div>
      </div>

      <input type="hidden" name="questions" value={payload} />

      <div className="space-y-3">
        {questions.map((question, index) => (
          <div key={index} className="glass card space-y-3 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted">
                Question {index + 1}
              </p>
              <div className="flex items-center gap-1.5">
                <select
                  value={question.type}
                  onChange={(event) =>
                    changeType(index, event.target.value as QuizQuestionType)
                  }
                  className="select h-8 w-auto py-0 text-[0.68rem]"
                  aria-label="Question type"
                >
                  <option value="mcq">Multiple choice</option>
                  <option value="truefalse">True / false</option>
                  <option value="match">Match the following</option>
                  <option value="short">Short answer</option>
                  <option value="long">Long answer</option>
                  <option value="application">Application-based</option>
                  <option value="problem">Problem-solving</option>
                </select>
                {questions.length > 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setQuestions((previous) => previous.filter((_, i) => i !== index))
                    }
                    className="btn btn-ghost btn-icon h-8 w-8 text-muted hover:text-pink"
                    aria-label="Remove question"
                  >
                    <Trash2 size={13} />
                  </button>
                ) : null}
              </div>
            </div>

            <textarea
              value={question.prompt}
              onChange={(event) => update(index, { prompt: event.target.value })}
              rows={2}
              placeholder="What is the powerhouse of the cell?"
              className="textarea min-h-[64px] text-sm"
            />

            {problems[index] ? (
              <p className="text-[0.65rem] font-medium text-pink">{problems[index]}</p>
            ) : null}

            {question.type === "mcq" ? (
              <div className="space-y-2">
                {question.options.map((option, optionIndex) => (
                  <div key={optionIndex} className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={question.correctAnswer === option && option !== ""}
                      onChange={() => update(index, { correctAnswer: option })}
                      className="accent-[#5BF0C8]"
                      aria-label={`Mark option ${optionIndex + 1} correct`}
                    />
                    <input
                      value={option}
                      onChange={(event) => {
                        const next = [...question.options];
                        const previousValue = next[optionIndex];
                        next[optionIndex] = event.target.value;
                        update(index, {
                          options: next,
                          correctAnswer:
                            question.correctAnswer === previousValue
                              ? event.target.value
                              : question.correctAnswer,
                        });
                      }}
                      placeholder={`Option ${optionIndex + 1}`}
                      className="input h-9 text-xs"
                    />
                  </div>
                ))}
                <p className="text-[0.62rem] text-muted">
                  Select the radio button next to the correct option.
                </p>
              </div>
            ) : null}

            {question.type === "truefalse" ? (
              <div className="flex gap-2">
                {["True", "False"].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => update(index, { correctAnswer: option })}
                    className={cn(
                      "btn btn-sm flex-1",
                      question.correctAnswer === option ? "btn-primary" : "btn-secondary",
                    )}
                  >
                    {option} is correct
                  </button>
                ))}
              </div>
            ) : null}

            {question.type === "match" ? (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-[0.58rem] uppercase tracking-[0.12em] text-muted">
                  <span>Left item</span>
                  <span>Matching right option</span>
                  <span />
                </div>
                {question.pairs.map((pair, pairIndex) => (
                  <div key={pairIndex} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <input
                      value={pair.left}
                      onChange={(event) =>
                        updatePair(index, pairIndex, { left: event.target.value })
                      }
                      placeholder={`Term ${pairIndex + 1}`}
                      className="input h-9 text-xs"
                    />
                    <input
                      value={pair.right}
                      onChange={(event) =>
                        updatePair(index, pairIndex, { right: event.target.value })
                      }
                      placeholder={`Meaning ${pairIndex + 1}`}
                      className="input h-9 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => removePair(index, pairIndex)}
                      disabled={question.pairs.length <= 2}
                      className="btn btn-ghost btn-icon h-9 w-9 text-muted hover:text-pink disabled:opacity-40"
                      aria-label="Remove pair"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addPair(index)}
                  className="btn btn-ghost btn-sm text-[0.62rem]"
                >
                  <Plus size={11} />
                  Add pair
                </button>
                <p className="text-[0.62rem] text-muted">
                  Right options are shuffled when the quiz is taken, so the mapping is never
                  shown to the student.
                </p>
              </div>
            ) : null}

            {question.type === "short" ||
            question.type === "long" ||
            question.type === "application" ||
            question.type === "problem" ? (
              <div>
                <label className="label">
                  {question.type === "short"
                    ? "Model answer"
                    : "Model answer / marking guide"}
                </label>
                <textarea
                  value={question.correctAnswer}
                  onChange={(event) => update(index, { correctAnswer: event.target.value })}
                  rows={question.type === "short" ? 2 : 4}
                  placeholder={
                    question.type === "problem"
                      ? "Show the expected working and final answer…"
                      : question.type === "application"
                        ? "Describe the reasoning a full-credit answer should show…"
                        : "Write the expected answer…"
                  }
                  className="textarea min-h-[60px] text-xs"
                />
                <p className="mt-1 text-[0.62rem] text-muted">
                  {question.type === "short"
                    ? "Short answers are graded by keyword overlap, so keep the model answer concise."
                    : "Longer answers are graded by key-idea overlap against this marking guide."}
                </p>
              </div>
            ) : null}

            <div>
              <label className="label">Explanation (shown after marking)</label>
              <input
                value={question.explanation}
                onChange={(event) => update(index, { explanation: event.target.value })}
                placeholder="Mitochondria produce ATP through respiration."
                className="input text-xs"
              />
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setQuestions((previous) => [...previous, emptyQuestion()])}
        className="btn btn-secondary w-full"
      >
        <Plus size={14} />
        Add another question
      </button>

      {hasProblems ? (
        <p className="rounded-xl border border-amber/30 bg-amber/10 px-4 py-2.5 text-xs text-amber">
          Fix the highlighted questions before saving. Multiple-choice questions need at least
          4 unique options, matching questions need at least 2 complete pairs, and every
          question needs an answer or marking guide.
        </p>
      ) : null}

      {state.error ? (
        <p className="rounded-xl border border-pink/30 bg-pink/10 px-4 py-2.5 text-xs text-pink">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        className="btn btn-primary w-full"
        disabled={pending || hasProblems}
      >
        {pending ? <Loader2 size={16} className="animate-spin" /> : <BrainCircuit size={16} />}
        {pending ? "Saving quiz…" : "Create quiz"}
        {!pending ? <ArrowRight size={15} /> : null}
      </button>
    </form>
  );
}
