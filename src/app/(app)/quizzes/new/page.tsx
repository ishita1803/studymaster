import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUserId } from "@/lib/session";
import { prisma } from "@/lib/db";
import { aiEnabled } from "@/lib/ai/gemini";
import { QuizBuilder } from "@/components/quizzes/quiz-builder";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "New quiz" };
// AI generation plus OCR of scanned pages can exceed the default timeout.
export const maxDuration = 60;

export default async function NewQuizPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; subjectId?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const userId = await requireUserId();

  const [subjects, notes] = await Promise.all([
    prisma.subject.findMany({
      where: { userId },
      include: { topics: { select: { id: true, name: true }, orderBy: { name: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.note.findMany({
      where: { userId },
      select: { id: true, title: true },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="New quiz"
        title="Make a practice test"
        description="Let Nova write it from your notes, or build each question yourself. Both land in the same weak-topic radar."
        action={
          <Link href="/quizzes" className="btn btn-secondary">
            <ArrowLeft size={14} />
            All quizzes
          </Link>
        }
      />

      <div className="mx-auto max-w-3xl">
        <QuizBuilder
          subjects={subjects.map((subject) => ({
            id: subject.id,
            name: subject.name,
            topics: subject.topics,
          }))}
          notes={notes}
          presetTopicId={params.topic}
          presetSubjectId={params.subjectId}
          presetTab={params.tab === "manual" ? "manual" : "ai"}
          aiEnabled={aiEnabled()}
        />
      </div>
    </div>
  );
}
