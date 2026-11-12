import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={`${keyPrefix}-b-${index++}`}>{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(
        <code
          key={`${keyPrefix}-c-${index++}`}
          className="rounded bg-white/10 px-1.5 py-0.5 text-[0.85em] text-mint"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function MarkdownLite({ text, className }: { text: string; className?: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let key = 0;

  const flushList = () => {
    if (list.length === 0) return;
    const items = list;
    list = [];
    blocks.push(
      <ul key={`ul-${key++}`}>
        {items.map((item, index) => (
          <li key={index}>{inline(item, `li-${key}-${index}`)}</li>
        ))}
      </ul>,
    );
  };

  for (const line of lines) {
    const listMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (listMatch) {
      list.push(listMatch[1]);
      continue;
    }
    flushList();

    if (!line.trim()) {
      blocks.push(<div key={`gap-${key++}`} className="h-2" />);
      continue;
    }

    if (line.startsWith("> ")) {
      blocks.push(
        <blockquote key={`quote-${key++}`}>{inline(line.slice(2), `q-${key}`)}</blockquote>,
      );
      continue;
    }

    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (heading) {
      blocks.push(
        <p key={`h-${key++}`} className="font-bold text-cream">
          {inline(heading[1], `h-${key}`)}
        </p>,
      );
      continue;
    }

    blocks.push(<p key={`p-${key++}`}>{inline(line, `p-${key}`)}</p>);
  }

  flushList();

  return <div className={cn("prose-nova text-sm", className)}>{blocks}</div>;
}
