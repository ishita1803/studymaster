"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";

export function ConfirmDeleteDialog({
  title,
  description,
  itemId,
  itemName,
  deleteAction,
  triggerLabel = "Delete",
  className,
  fieldName = "id",
}: {
  title: string;
  description: string;
  itemId: string;
  itemName?: string;
  deleteAction: (formData: FormData) => Promise<unknown> | void;
  triggerLabel?: string;
  className?: string;
  /** Form field the action reads ("id", "subjectId", …). */
  fieldName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.append(fieldName, itemId);
      await deleteAction(fd);
      setOpen(false);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className || "btn btn-ghost btn-sm text-pink hover:bg-pink/10"}
        title={title}
      >
        <Trash2 size={13} />
        {triggerLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md rounded-2xl border border-pink/30 bg-[#0d121f] p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 text-muted hover:text-cream transition"
            >
              <X size={18} />
            </button>

            <div className="flex items-start gap-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-pink/30 bg-pink/15 text-pink">
                <AlertTriangle size={20} />
              </span>
              <div>
                <h3 className="text-base font-semibold text-cream">{title}</h3>
                {itemName && (
                  <p className="mt-1 text-xs font-medium text-pink">
                    &ldquo;{itemName}&rdquo;
                  </p>
                )}
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  {description}
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending}
                className="btn btn-primary btn-sm bg-pink hover:bg-pink/90 text-black border-pink"
              >
                {isPending ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
