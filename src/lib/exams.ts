import { prisma } from "@/lib/db";
import { startOfDay } from "@/lib/utils";

/**
 * `Subject.examDate` is a derived cache of the nearest upcoming exam. The
 * scheduler, dashboard and analytics only need one deadline per subject, while
 * students can keep adding as many tests as they like (unit test, midterm,
 * final…) in the Exam table.
 */
export async function syncSubjectExamDate(subjectId: string) {
  const next = await prisma.exam.findFirst({
    where: { subjectId, date: { gte: startOfDay() } },
    orderBy: [{ date: "asc" }, { importance: "desc" }],
    select: { date: true },
  });

  // Only write when the derived date actually drifted — this sync also runs
  // on page load, and a needless update per subject per visit would lock the
  // SQLite database for nothing on every roadmap navigation.
  const stored = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { examDate: true },
  });
  const nextTime = next?.date?.getTime() ?? null;
  if ((stored?.examDate?.getTime() ?? null) !== nextTime) {
    await prisma.subject.update({
      where: { id: subjectId },
      data: { examDate: next?.date ?? null },
    });
  }

  return next?.date ?? null;
}

/**
 * Recomputes every subject that has exams. Subjects that only have a legacy
 * `examDate` (from before multiple tests were supported) get one Exam row
 * created first, so their deadline shows up in the planner instead of vanishing.
 */
export async function syncAllSubjectExamDates(userId: string) {
  const subjects = await prisma.subject.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      importance: true,
      examDate: true,
      _count: { select: { exams: true } },
    },
  });

  const today = startOfDay();
  for (const subject of subjects) {
    if (
      subject._count.exams === 0 &&
      subject.examDate &&
      subject.examDate >= today
    ) {
      await prisma.exam.create({
        data: {
          userId,
          subjectId: subject.id,
          name: `${subject.name} exam`,
          date: subject.examDate,
          importance: subject.importance,
        },
      });
    }
  }

  const withExams = subjects.filter((subject) => subject._count.exams > 0);
  const legacy = subjects.filter(
    (subject) =>
      subject._count.exams === 0 &&
      subject.examDate &&
      subject.examDate >= today,
  );

  await Promise.all([
    ...withExams.map((subject) => syncSubjectExamDate(subject.id)),
    ...legacy.map((subject) => syncSubjectExamDate(subject.id)),
  ]);
}

export async function listUpcomingExams(userId: string, limit = 20) {
  return prisma.exam.findMany({
    where: { userId, date: { gte: startOfDay() } },
    include: {
      subject: { select: { id: true, name: true, color: true } },
      examTopics: { select: { topicId: true, difficulty: true } },
    },
    orderBy: [{ date: "asc" }, { importance: "desc" }],
    take: limit,
  });
}
