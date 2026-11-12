"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared pending-state progress for server-action forms.
 *
 * Two pieces:
 * - `PendingBar` — an animated track + rotating stage description. Renders
 *   nothing while idle. Use on its own next to a form that reports pending
 *   through its own state, or as the visual part of `PendingSubmit`.
 * - `PendingSubmit` — a submit button that shows the bar below itself while
 *   the enclosing form is submitting, disables itself to prevent duplicate
 *   clicks, and (optionally) turns its label into the stage text.
 *
 * Real percentages are served by the flashcard `GenerationJob` poller in
 * `card-tools.tsx`; everything else (which finishes in one server action)
 * uses this stage-based indeterminate progress.
 */

const STAGE_INTERVAL_MS = 2600;

export function ProgressTrack({ className }: { className?: string }) {
  return (
    <div
      className={cn("progress-track", className)}
      role="progressbar"
      aria-busy="true"
      aria-label="Working"
    >
      <div className="progress-range" />
    </div>
  );
}

export function useStagedLabel(stages: string[], active: boolean): string {
  const [index, setIndex] = useState(0);
  const count = stages.length;

  useEffect(() => {
    if (!active || count <= 1) {
      setIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, STAGE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, count]);

  return stages[Math.min(index, count - 1)] ?? "";
}

export function PendingBar({
  pending,
  stages,
  className,
  withLabel = true,
}: {
  pending: boolean;
  stages: string[];
  className?: string;
  withLabel?: boolean;
}) {
  const label = useStagedLabel(stages, pending);
  if (!pending) return null;
  return (
    <div className={cn("space-y-1.5", className)} aria-live="polite">
      <ProgressTrack />
      {withLabel && label ? (
        <p className="flex items-center gap-1.5 text-[0.62rem] leading-tight text-muted">
          <Loader2 size={11} className="shrink-0 animate-spin text-mint" />
          {label}
        </p>
      ) : null}
    </div>
  );
}

export function PendingSubmit({
  idleLabel,
  stages,
  className,
  icon,
  disabled = false,
}: {
  /** Label while idle. */
  idleLabel: string;
  /** Rotating stage descriptions shown while pending. */
  stages: string[];
  className?: string;
  /** Idle icon; replaced by the spinner while pending. */
  icon?: ReactNode;
  /** extra disabled condition (in addition to pending). */
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const stage = useStagedLabel(stages, pending);

  return (
    <div className="space-y-1.5">
      <button
        type="submit"
        className={className ?? "btn btn-primary w-full"}
        disabled={pending || disabled}
        aria-busy={pending}
      >
        {pending ? <Loader2 size={15} className="animate-spin" /> : icon}
        <span>{pending ? stage : idleLabel}</span>
      </button>
      {pending ? <ProgressTrack /> : null}
    </div>
  );
}

/**
 * Drop-in helper for forms that already own their pending state through
 * `useActionState` — renders the submit button plus the stage bar.
 */
export function PendingSubmitStateful({
  pending,
  idleLabel,
  busyLabel,
  stages,
  className,
}: {
  pending: boolean;
  idleLabel: string;
  busyLabel?: string;
  stages?: string[];
  className?: string;
}) {
  return (
    <div className="space-y-1.5">
      <button type="submit" className={className ?? "btn btn-primary w-full"} disabled={pending} aria-busy={pending}>
        {pending ? <Loader2 size={15} className="animate-spin" /> : null}
        <span>{pending ? busyLabel ?? (stages?.[0] ?? "Working…") : idleLabel}</span>
      </button>
      <PendingBar pending={pending} stages={stages ?? [busyLabel ?? "Working…"]} />
    </div>
  );
}
