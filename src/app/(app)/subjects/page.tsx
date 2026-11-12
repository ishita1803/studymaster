import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  Layers,
  NotebookPen,
  Plus,
} from "lucide-react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { Nova } from "@/components/nova";
import { colorVar, examCountdown, startOfDay } from "@/lib/utils";

export const metadata: Metadata = { title: "Subjects" };

export default async function SubjectsPage() {
  const user = await requireUser();
  const subjects = await prisma.subject.findMany({
    where: { userId: user.id },
    include: {
      _count: {
        select: { topics: true, notes: true, flashcards: true, quizzes: true, exams: true },
      },
      exams: {
        where: { date: { gte: startOfDay() } },
        orderBy: { date: "asc" },
        take: 1,
        select: { name: true, date: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div>
      <PageHeader
        eyebrow="Study containers"
        title="Subjects"
        description="A subject holds your documents, extracted syllabus, cards and quizzes. It only enters the roadmap when a dated test selects its topics."
        action={
          <Link href="/roadmap" className="btn btn-primary">
            <Plus size={15} />
            Add subject
          </Link>
        }
      />

      {subjects.length === 0 ? (
        <Card className="px-6 py-12 text-center">
          <Nova size={56} mood="happy" className="mx-auto" />
          <p className="display mt-4 text-lg font-semibold text-cream">No subjects yet</p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted">
            Create a subject, upload its notes, and approve the extracted syllabus. Then add
            a dated test and pick the topics it covers to start the roadmap.
          </p>
          <Link href="/roadmap" className="btn btn-primary mt-5">
            <Plus size={14} />
            Create your first subject
          </Link>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {subjects.map((subject) => {
            const nextExam = subject.exams[0];
            const countdown = examCountdown(nextExam ? nextExam.date : null);
            return (
              <Link key={subject.id} href={`/subjects/${subject.id}`} className="group">
                <Card className="h-full p-5 transition group-hover:border-mint/25 group-hover:bg-white/[0.045]">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-1 h-3 w-3 shrink-0 rounded-full"
                      style={{ background: colorVar(subject.color) }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="display truncate text-base font-semibold text-cream">
                        {subject.name}
                      </p>
                      <p className="mt-1 line-clamp-2 min-h-[2rem] text-[0.7rem] leading-relaxed text-muted">
                        {subject.description || "No description yet."}
                      </p>
                    </div>
                    <ArrowRight
                      size={16}
                      className="mt-1 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-mint"
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-[0.65rem] text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <BookOpen size={12} className="text-violet" />
                      {subject._count.topics} topic{subject._count.topics === 1 ? "" : "s"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <NotebookPen size={12} className="text-sky" />
                      {subject._count.notes} document{subject._count.notes === 1 ? "" : "s"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Layers size={12} className="text-mint" />
                      {subject._count.flashcards} card{subject._count.flashcards === 1 ? "" : "s"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <BrainCircuit size={12} className="text-amber" />
                      {subject._count.quizzes} quiz{subject._count.quizzes === 1 ? "" : "zes"}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-1.5 border-t border-white/6 pt-3 text-[0.65rem]">
                    <CalendarDays size={12} className={nextExam ? "text-pink" : "text-muted"} />
                    {nextExam ? (
                      <span className="truncate text-cream/85">
                        {nextExam.name} ·{" "}
                        <span className={countdown?.urgent ? "text-pink" : "text-mint"}>
                          {countdown?.label ?? "soon"}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted">No dated test — not on the roadmap</span>
                    )}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
