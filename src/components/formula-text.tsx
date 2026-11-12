"use client";

import { Fragment } from "react";
import { MATH_PATTERN, prettyMath } from "@/lib/formula";

/**
 * Renders inline `$...$` and block `$$...$$` math found in notes, cards and
 * quizzes without a heavyweight math dependency.
 */
export function FormulaText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const parts = text.split(MATH_PATTERN);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (!part) return null;

        const block = part.startsWith("$$") && part.endsWith("$$");
        const inline = !block && part.startsWith("$") && part.endsWith("$");

        if (block || inline) {
          const math = part.slice(block ? 2 : 1, block ? -2 : -1);
          return (
            <span
              key={index}
              className="mx-0.5 inline-block rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.95em] text-cream [overflow-wrap:anywhere]"
            >
              {prettyMath(math)}
            </span>
          );
        }

        return <Fragment key={index}>{part}</Fragment>;
      })}
    </span>
  );
}
