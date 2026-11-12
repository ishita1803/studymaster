"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Sparkles, X } from "lucide-react";
import { Nova } from "@/components/nova";
import { MarkdownLite } from "@/components/markdown-lite";
import { cn } from "@/lib/utils";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Explain my weakest topic simply",
  "Make a 5-question practice quiz",
  "Give me a hint, not the answer",
  "Summarise what I studied today",
];

const GREETING: Message = {
  role: "assistant",
  content:
    "Hey! I'm **Nova**, your study sidekick. 🌱 Ask me to explain a concept, quiz you, or turn your notes into a revision summary.\n\nIf you want the answer, I'll still give you a hint first — that's how it sticks.",
};

export function AssistantDrawer({
  open,
  onClose,
  aiEnabled,
  studentName,
}: {
  open: boolean;
  onClose: () => void;
  aiEnabled: boolean;
  studentName: string;
}) {
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 220);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, open]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || streaming) return;

    const next: Message[] = [...messages, { role: "user", content: question }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-12) }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages((previous) => {
          const copy = [...previous];
          copy[copy.length - 1] = { role: "assistant", content: accumulated };
          return copy;
        });
      }

      if (!accumulated) {
        setMessages((previous) => {
          const copy = [...previous];
          copy[copy.length - 1] = {
            role: "assistant",
            content: "I zoned out for a second there. Try asking again?",
          };
          return copy;
        });
      }
    } catch {
      setMessages((previous) => {
        const copy = [...previous];
        copy[copy.length - 1] = {
          role: "assistant",
          content:
            "I couldn't reach the study server. Check your connection, or keep going with the timer — I'll be here.",
        };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }

  return (
    <>
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-50 bg-ink/70 backdrop-blur-sm transition-opacity duration-300",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Ask Nova"
        className={cn(
          "glass-strong fixed right-0 top-0 z-50 flex h-dvh w-full max-w-md flex-col border-l border-white/10 transition-transform duration-400 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
          <div className="flex items-center gap-3">
            <Nova size={40} mood={streaming ? "focused" : "happy"} />
            <div>
              <p className="display text-base font-semibold text-cream">Ask Nova</p>
              <p className="text-[0.65rem] text-muted">
                {aiEnabled ? "Gemini connected · hint-first tutor" : "Demo mode · add a Gemini key for full answers"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-icon"
            aria-label="Close assistant"
          >
            <X size={18} />
          </button>
        </header>

        <div ref={scrollRef} className="scroll-thin flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {messages.map((message, index) => (
            <div
              key={index}
              className={cn(
                "flex gap-2.5",
                message.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              {message.role === "assistant" ? (
                <div className="mt-1 shrink-0">
                  <Nova size={28} float={false} mood={streaming && index === messages.length - 1 ? "focused" : "happy"} />
                </div>
              ) : null}
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-3",
                  message.role === "user"
                    ? "rounded-br-md bg-gradient-to-br from-mint/20 to-violet/20 text-cream"
                    : "rounded-bl-md border border-white/8 bg-white/[0.04]",
                )}
              >
                {message.role === "assistant" ? (
                  message.content ? (
                    <MarkdownLite text={message.content} />
                  ) : (
                    <span className="flex items-center gap-2 text-xs text-muted">
                      <Loader2 size={13} className="animate-spin" />
                      Nova is thinking…
                    </span>
                  )
                ) : (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-white/8 px-4 pb-4 pt-3">
          <div className="mb-3 flex gap-2 overflow-x-auto no-scrollbar">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => void send(suggestion)}
                disabled={streaming}
                className="chip shrink-0 transition hover:border-mint/40 hover:text-cream disabled:opacity-40"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
            className="relative"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(input);
                }
              }}
              rows={2}
              placeholder={`Ask me anything, ${studentName}…`}
              className="textarea min-h-[64px] resize-none pr-14"
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              className="btn btn-primary btn-icon absolute bottom-2.5 right-2.5"
              aria-label="Send message"
            >
              {streaming ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ArrowUp size={16} />
              )}
            </button>
          </form>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-[0.62rem] text-muted">
            <Sparkles size={10} className="text-mint" />
            Nova hints first, answers second. Verify important facts.
          </p>
        </div>
      </aside>
    </>
  );
}
