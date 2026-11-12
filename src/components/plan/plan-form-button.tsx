"use client";

import type { ReactNode } from "react";
import { PendingSubmit } from "@/components/ui/pending-progress";

/**
 * Client wrapper so server-action forms rendered from server components get
 * a pending state: the label becomes the current stage and duplicate
 * submits are blocked while the plan service runs.
 */
export function PlanFormButton({
  action,
  idleLabel,
  idleIcon,
  stages,
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  idleLabel: string;
  idleIcon?: ReactNode;
  stages: string[];
  className?: string;
}) {
  return (
    <form action={action}>
      <PendingSubmit
        idleLabel={idleLabel}
        icon={idleIcon}
        stages={stages}
        className={className ?? "btn btn-secondary"}
      />
    </form>
  );
}
