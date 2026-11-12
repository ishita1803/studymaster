"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { autoRolloverAction } from "@/lib/actions/plan";

type Notice = { missed: number; items: number };

/**
 * Quietly re-plans overdue work the first time a plan page is opened.
 * Completed blocks are kept, so this only moves what was actually missed.
 */
export function AutoReschedule() {
  const router = useRouter();
  const started = useRef(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let active = true;

    autoRolloverAction()
      .then((result) => {
        if (!active || !result?.rescheduled) return;
        setNotice({ missed: result.missed, items: result.items });
        router.refresh();
      })
      .catch(() => {
        // A failed rollover should never block the page from rendering.
      });

    return () => {
      active = false;
    };
  }, [router]);

  if (!notice || hidden) return null;

  return (
    <div
      role="status"
      className="mb-5 flex items-start gap-3 rounded-2xl border border-mint/25 bg-mint/[0.06] px-4 py-3 text-xs"
    >
      <Sparkles size={15} className="mt-0.5 shrink-0 text-mint" />
      <p className="flex-1 leading-relaxed text-muted">
        <span className="font-semibold text-cream">Nova re-planned your week.</span>{" "}
        {notice.missed} missed block{notice.missed === 1 ? "" : "s"} moved into{" "}
        {notice.items} fresh block{notice.items === 1 ? "" : "s"} spread across the days
        you have left. Completed work was kept.
      </p>
      <button
        type="button"
        onClick={() => setHidden(true)}
        className="btn btn-ghost btn-icon h-7 w-7 shrink-0"
        aria-label="Dismiss reschedule notice"
      >
        <X size={13} />
      </button>
    </div>
  );
}
