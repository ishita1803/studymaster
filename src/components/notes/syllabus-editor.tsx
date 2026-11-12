"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  CircleAlert,
  GitMerge,
  Loader2,
  Pencil,
  Plus,
  ScanSearch,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  addSyllabusTopicAction,
  approveSyllabusAction,
  deleteSyllabusTopicAction,
  detectSubjectSyllabusAction,
  detectSyllabusAction,
  mergeSyllabusTopicsAction,
  moveSyllabusTopicAction,
  updateSyllabusTopicAction,
} from "@/lib/actions/syllabus";
import { PendingSubmit } from "@/components/ui/pending-progress";
import { cn } from "@/lib/utils";

export type SyllabusTopic = {
  id: string;
  parentId: string | null;
  name: string;
  kind: string;
  chapter: string;
  sourceRef: string;
  status: string;
  difficulty: number;
  importance: number;
  estimatedMinutes: number;
  approved: boolean;
  position: number;
};

type TreeNode = SyllabusTopic & { children: TreeNode[] };

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

const KIND_LABEL: Record<string, string> = {
  chapter: "Chapter",
  topic: "Topic",
  subtopic: "Subtopic",
  concept: "Concept",
  definition: "Definition",
  formula: "Formula",
  process: "Process",
  problem: "Problem",
};

function buildTree(topics: SyllabusTopic[]): TreeNode[] {
  const nodes = new Map<string, TreeNode>();
  for (const topic of topics) nodes.set(topic.id, { ...topic, children: [] });
  const roots: TreeNode[] = [];
  for (const topic of topics) {
    const node = nodes.get(topic.id);
    if (!node) continue;
    const parent = topic.parentId ? nodes.get(topic.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (list: TreeNode[]) => {
    list.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    list.forEach((node) => sort(node.children));
  };
  sort(roots);
  return roots;
}

function flattenTree(nodes: TreeNode[]): TreeNode[] {
  const rows: TreeNode[] = [];
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      rows.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return rows;
}

function DetectButton({ label }: { label: string }) {
  return (
    <PendingSubmit
      idleLabel={label}
      icon={<ScanSearch size={13} />}
      stages={[
        "Reading source material…",
        "Mapping chapters and topics…",
        "Building the syllabus tree…",
        "Saving…",
      ]}
      className="btn btn-primary btn-sm"
    />
  );
}

export function DetectSyllabusForm({
  noteId,
  hasContent,
}: {
  noteId: string;
  hasContent: boolean;
}) {
  if (!hasContent) {
    return (
      <p className="rounded-xl border border-dashed border-white/10 px-3.5 py-3 text-[0.68rem] leading-relaxed text-muted">
        Add a few sentences, headings or bullet points to this note first. Nova needs real
        material before it can detect chapters and topics.
      </p>
    );
  }

  return (
    <form action={detectSyllabusAction} className="space-y-2.5">
      <input type="hidden" name="noteId" value={noteId ?? ""} />
      <p className="text-[0.68rem] leading-relaxed text-muted">
        Nova reads this note and builds a chapter → topic → subtopic tree with source
        references. You can rename, reorder and remove anything before approving it.
      </p>
      <DetectButton label="Detect syllabus" />
    </form>
  );
}

export function SyllabusEditor({
  noteId,
  subjectId,
  subjectName,
  approved,
  topics,
}: {
  noteId?: string | null;
  subjectId: string | null;
  subjectName: string | null;
  approved: boolean;
  topics: SyllabusTopic[];
}) {
  const tree = useMemo(() => buildTree(topics), [topics]);
  const rows = useMemo(() => flattenTree(tree), [tree]);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(rows.filter((node) => node.children.length > 0).map((node) => node.id)),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  // When set, every other row offers "merge here": the picked row swallows
  // the source topic (children + quizzes + cards + plan history move over).
  const [mergingId, setMergingId] = useState<string | null>(null);

  const detected = topics.filter((topic) => !topic.approved).length;
  const leafCount = rows.filter((node) => node.children.length === 0).length;

  function toggle(id: string) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (topics.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen size={15} className="text-violet" />
          <p className="eyebrow">Automatic syllabus</p>
        </div>
        {noteId ? (
          <DetectSyllabusForm noteId={noteId} hasContent />
        ) : subjectId ? (
          <form action={detectSubjectSyllabusAction} className="space-y-2.5">
            <input type="hidden" name="subjectId" value={subjectId} />
            <p className="text-[0.68rem] leading-relaxed text-muted">
              Nova reads every document in this subject and builds one shared
              chapter → topic → subtopic tree. Duplicate topics across files are merged.
            </p>
            <DetectButton label="Detect from all documents" />
          </form>
        ) : (
          <p className="rounded-xl border border-dashed border-white/10 px-3.5 py-3 text-[0.68rem] leading-relaxed text-muted">
            Upload a document or add a topic to start the syllabus.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookOpen size={15} className="text-violet" />
          <div>
            <p className="eyebrow">Detected syllabus</p>
            <p className="text-[0.62rem] text-muted">
              {rows.length} node{rows.length === 1 ? "" : "s"} · {leafCount} study topic
              {leafCount === 1 ? "" : "s"}
              {subjectName ? ` · ${subjectName}` : ""}
            </p>
          </div>
        </div>
        {noteId ? (
          <form action={detectSyllabusAction}>
            <input type="hidden" name="noteId" value={noteId ?? ""} />
            <PendingSubmit
              idleLabel="Re-detect"
              icon={<ScanSearch size={12} />}
              stages={["Reading this note…", "Mapping chapters and topics…", "Saving…"]}
              className="btn btn-ghost btn-sm text-[0.65rem]"
            />
          </form>
        ) : subjectId ? (
          <form action={detectSubjectSyllabusAction}>
            <input type="hidden" name="subjectId" value={subjectId} />
            <PendingSubmit
              idleLabel="Re-detect all documents"
              icon={<ScanSearch size={12} />}
              stages={[
                "Reading uploaded documents…",
                "Mapping chapters and topics…",
                "Saving…",
              ]}
              className="btn btn-ghost btn-sm text-[0.65rem]"
            />
          </form>
        ) : null}
      </div>

      {!approved || detected > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber/30 bg-amber/[0.08] px-3.5 py-2.5">
          <CircleAlert size={14} className="shrink-0 text-amber" />
          <p className="min-w-0 flex-1 text-[0.68rem] leading-relaxed text-cream">
            {detected > 0
              ? `${detected} detected topic${detected === 1 ? " is" : "s are"} waiting for review. They stay out of your roadmap until you approve.`
              : "This syllabus is not approved yet, so it stays out of your roadmap."}
          </p>
          {subjectId ? (
            <form action={approveSyllabusAction}>
              <input type="hidden" name="noteId" value={noteId ?? ""} />
              <input type="hidden" name="subjectId" value={subjectId} />
              <PendingSubmit
                idleLabel="Approve & plan"
                icon={<Check size={13} />}
                stages={["Saving the approved syllabus…", "Rebuilding your roadmap…"]}
                className="btn btn-primary btn-sm"
              />
            </form>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-mint/25 bg-mint/[0.06] px-3.5 py-2.5">
          <Check size={14} className="shrink-0 text-mint" />
          <p className="min-w-0 flex-1 text-[0.68rem] leading-relaxed text-cream">
            Approved. These topics now drive your roadmap, flashcards, quizzes and analytics.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        {mergingId ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-violet/30 bg-violet/[0.08] px-3.5 py-2.5">
            <GitMerge size={14} className="shrink-0 text-violet" />
            <p className="min-w-0 flex-1 text-[0.68rem] text-cream">
              Pick the topic to merge
              {" "}
              <span className="font-semibold">
                {topics.find((topic) => topic.id === mergingId)?.name}
              </span>
              {" "}
              into. Its subtopics, quizzes, flashcards and study history move with it.
            </p>
            <button
              type="button"
              onClick={() => setMergingId(null)}
              className="btn btn-ghost btn-sm h-7 px-2 text-[0.6rem]"
            >
              <X size={11} />
              Cancel
            </button>
          </div>
        ) : null}
        {rows.map((node) => {
          const depth = (() => {
            let level = 0;
            let current = node.parentId;
            const byId = new Map(topics.map((topic) => [topic.id, topic]));
            while (current && level < 8) {
              level += 1;
              current = byId.get(current)?.parentId ?? null;
            }
            return level;
          })();
          const isOpen = expanded.has(node.id);
          const isEditing = editingId === node.id;
          const isAdding = addingTo === node.id;

          return (
            <div key={node.id}>
              <div
                className={cn(
                  "rounded-xl border border-white/6 bg-black/20 px-2.5 py-2",
                  !node.approved && "border-amber/20 bg-amber/[0.04]",
                )}
                style={{ marginLeft: `${Math.min(depth, 6) * 14}px` }}
              >
                <div className="flex items-start gap-1.5">
                  {node.children.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => toggle(node.id)}
                      className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md text-muted hover:bg-white/5 hover:text-cream"
                      aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
                    >
                      {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>
                  ) : (
                    <span className="mt-0.5 h-5 w-5 shrink-0" />
                  )}

                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <form action={updateSyllabusTopicAction} className="space-y-2 py-1">
                        <input type="hidden" name="id" value={node.id} />
                        <input
                          name="name"
                          defaultValue={node.name}
                          className="input h-8 text-xs"
                          required
                        />
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <label className="text-[0.55rem] text-muted">
                            Status
                            <select
                              name="status"
                              defaultValue={node.status}
                              className="select mt-0.5 h-7 py-0 text-[0.65rem]"
                            >
                              {STATUSES.map((status) => (
                                <option key={status.value} value={status.value}>
                                  {status.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-[0.55rem] text-muted">
                            Difficulty
                            <select
                              name="difficulty"
                              defaultValue={node.difficulty}
                              className="select mt-0.5 h-7 py-0 text-[0.65rem]"
                            >
                              {[1, 2, 3, 4, 5].map((value) => (
                                <option key={value} value={value}>
                                  {value}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-[0.55rem] text-muted">
                            Importance
                            <select
                              name="importance"
                              defaultValue={node.importance}
                              className="select mt-0.5 h-7 py-0 text-[0.65rem]"
                            >
                              {[1, 2, 3, 4, 5].map((value) => (
                                <option key={value} value={value}>
                                  {value}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-[0.55rem] text-muted">
                            Minutes
                            <input
                              name="estimatedMinutes"
                              type="number"
                              min={15}
                              max={600}
                              step={5}
                              defaultValue={node.estimatedMinutes}
                              className="input mt-0.5 h-7 py-0 text-[0.65rem]"
                            />
                          </label>
                        </div>
                        <div className="flex gap-1.5">
                          <button type="submit" className="btn btn-primary btn-sm h-7 px-2 text-[0.6rem]">
                            <Check size={11} />
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="btn btn-ghost btn-sm h-7 px-2 text-[0.6rem]"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="min-w-0 break-words text-xs font-semibold text-cream">
                            {node.name}
                          </span>
                          {node.kind !== "topic" ? (
                            <span className="chip text-[0.5rem]">
                              {KIND_LABEL[node.kind] ?? node.kind}
                            </span>
                          ) : null}
                          <span
                            className={cn(
                              "text-[0.55rem]",
                              STATUS_CHIP[node.status] ?? "chip",
                            )}
                          >
                            {STATUSES.find((status) => status.value === node.status)?.label ??
                              node.status}
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.56rem] text-muted">
                          {node.sourceRef ? <span>{node.sourceRef}</span> : null}
                          {node.sourceRef ? <span>·</span> : null}
                          <span>{node.estimatedMinutes} min</span>
                          <span>·</span>
                          <span>Difficulty {node.difficulty}/5</span>
                          {node.children.length > 0 ? (
                            <>
                              <span>·</span>
                              <span>
                                {node.children.length} sub-topic
                                {node.children.length === 1 ? "" : "s"}
                              </span>
                            </>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>

                  {!isEditing ? (
                    <div className="flex shrink-0 items-center gap-0.5">
                      {mergingId && mergingId !== node.id ? (
                        <form
                          action={async (formData) => {
                            await mergeSyllabusTopicsAction(formData);
                            setMergingId(null);
                          }}
                        >
                          <input type="hidden" name="sourceId" value={mergingId} />
                          <input type="hidden" name="targetId" value={node.id} />
                          <button
                            type="submit"
                            className="btn btn-ghost h-6 rounded-md px-1.5 text-[0.55rem] font-semibold text-violet hover:text-cream"
                            aria-label={`Merge the selected topic into ${node.name}`}
                          >
                            <GitMerge size={11} />
                            Merge here
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setMergingId(mergingId === node.id ? null : node.id);
                            setAddingTo(null);
                          }}
                          className={cn(
                            "btn btn-ghost btn-icon h-6 w-6",
                            mergingId === node.id
                              ? "text-violet"
                              : "text-muted hover:text-cream",
                          )}
                          aria-label={`Merge ${node.name} into another topic`}
                        >
                          <GitMerge size={11} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(node.id);
                          setAddingTo(null);
                        }}
                        className="btn btn-ghost btn-icon h-6 w-6 text-muted hover:text-cream"
                        aria-label={`Edit ${node.name}`}
                      >
                        <Pencil size={11} />
                      </button>
                      <form action={moveSyllabusTopicAction}>
                        <input type="hidden" name="id" value={node.id} />
                        <input type="hidden" name="direction" value="up" />
                        <button
                          type="submit"
                          className="btn btn-ghost btn-icon h-6 w-6 text-muted hover:text-cream"
                          aria-label={`Move ${node.name} up`}
                        >
                          <ChevronsUpDown size={11} className="rotate-180" />
                        </button>
                      </form>
                      <form action={moveSyllabusTopicAction}>
                        <input type="hidden" name="id" value={node.id} />
                        <input type="hidden" name="direction" value="down" />
                        <button
                          type="submit"
                          className="btn btn-ghost btn-icon h-6 w-6 text-muted hover:text-cream"
                          aria-label={`Move ${node.name} down`}
                        >
                          <ChevronsUpDown size={11} />
                        </button>
                      </form>
                      <button
                        type="button"
                        onClick={() => {
                          setAddingTo(isAdding ? null : node.id);
                          setEditingId(null);
                          setExpanded((previous) => new Set(previous).add(node.id));
                        }}
                        className="btn btn-ghost btn-icon h-6 w-6 text-muted hover:text-mint"
                        aria-label={`Add a subtopic under ${node.name}`}
                      >
                        <Plus size={11} />
                      </button>
                      <form action={deleteSyllabusTopicAction}>
                        <input type="hidden" name="id" value={node.id} />
                        <button
                          type="submit"
                          className="btn btn-ghost btn-icon h-6 w-6 text-muted hover:text-pink"
                          aria-label={`Delete ${node.name}`}
                        >
                          <Trash2 size={11} />
                        </button>
                      </form>
                    </div>
                  ) : null}
                </div>

                {isAdding && subjectId ? (
                  <form
                    action={async (formData) => {
                      await addSyllabusTopicAction(formData);
                      setAddingTo(null);
                    }}
                    className="mt-2 flex flex-wrap items-end gap-1.5 rounded-lg bg-mint/[0.05] p-2"
                  >
                    <input type="hidden" name="subjectId" value={subjectId} />
                    <input type="hidden" name="noteId" value={noteId ?? ""} />
                    <input type="hidden" name="parentId" value={node.id} />
                    <input
                      name="name"
                      required
                      placeholder="New subtopic name"
                      className="input h-8 min-w-0 flex-1 text-xs"
                      autoFocus
                    />
                    <select
                      name="kind"
                      defaultValue="subtopic"
                      className="select h-8 w-auto py-0 text-[0.65rem]"
                      aria-label="Node kind"
                    >
                      <option value="subtopic">Subtopic</option>
                      <option value="concept">Concept</option>
                      <option value="definition">Definition</option>
                      <option value="formula">Formula</option>
                      <option value="process">Process</option>
                      <option value="problem">Problem</option>
                    </select>
                    <button type="submit" className="btn btn-primary btn-sm h-8 px-2 text-[0.6rem]">
                      <Plus size={11} />
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddingTo(null)}
                      className="btn btn-ghost btn-sm h-8 px-2 text-[0.6rem]"
                    >
                      <X size={11} />
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {subjectId ? (
        <form
          action={addSyllabusTopicAction}
          className="flex flex-wrap items-end gap-1.5 rounded-xl border border-dashed border-white/10 p-2.5"
        >
          <input type="hidden" name="subjectId" value={subjectId} />
          <input type="hidden" name="noteId" value={noteId ?? ""} />
          <input
            name="name"
            required
            placeholder="Add a chapter or topic manually"
            className="input h-8 min-w-0 flex-1 text-xs"
          />
          <select
            name="kind"
            defaultValue="topic"
            className="select h-8 w-auto py-0 text-[0.65rem]"
            aria-label="Node kind"
          >
            <option value="chapter">Chapter</option>
            <option value="topic">Topic</option>
            <option value="subtopic">Subtopic</option>
            <option value="concept">Concept</option>
            <option value="formula">Formula</option>
          </select>
          <button type="submit" className="btn btn-secondary btn-sm h-8 px-2 text-[0.6rem]">
            <Plus size={11} />
            Add
          </button>
        </form>
      ) : (
        <p className="flex items-center gap-1.5 text-[0.62rem] text-muted">
          <Sparkles size={11} />
          Assign a subject to this note to approve the syllabus and start planning.
        </p>
      )}
    </div>
  );
}
