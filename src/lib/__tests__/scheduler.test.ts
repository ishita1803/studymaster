import { describe, expect, it } from "vitest";
import {
  buildPlan,
  capacityShortfalls,
  clockToMinute,
  difficultyLabel,
  minuteToClock,
  revisionWindowDays,
  topicPriority,
  topicPriorityBreakdown,
  type CapacityTopic,
  type SchedulerTopic,
} from "../scheduler";
import { addDays } from "date-fns";

const start = new Date(2026, 0, 5); // Monday 5 Jan 2026, local time

function topic(overrides: Partial<SchedulerTopic> = {}): SchedulerTopic {
  return {
    id: "t1",
    subjectId: "s1",
    subjectName: "Biology",
    subjectColor: "mint",
    name: "Cell division",
    difficulty: 3,
    importance: 3,
    estimatedMinutes: 60,
    completedMinutes: 0,
    examDate: null,
    status: "not_started",
    masteryScore: 0,
    weak: false,
    ...overrides,
  };
}

function byDay(plan: ReturnType<typeof buildPlan>) {
  const map = new Map<string, number>();
  for (const item of plan) {
    map.set(item.date, (map.get(item.date) ?? 0) + item.minutes);
  }
  return map;
}

describe("buildPlan", () => {
  it("returns no items when there are no topics", () => {
    expect(buildPlan([], { startDate: start, dailyMinutes: 120 })).toEqual([]);
  });

  it("never books more than the daily minute budget", () => {
    const plan = buildPlan(
      [
        topic({ id: "a", examDate: "2026-01-12", estimatedMinutes: 180 }),
        topic({
          id: "b",
          subjectId: "s2",
          subjectName: "Maths",
          examDate: "2026-01-12",
          estimatedMinutes: 180,
        }),
      ],
      { startDate: start, dailyMinutes: 90, horizonDays: 7 },
    );

    for (const minutes of byDay(plan).values()) {
      expect(minutes).toBeLessThanOrEqual(90);
    }
  });

  it("does not schedule a subject after its exam date", () => {
    const examDate = "2026-01-09";
    const plan = buildPlan(
      [topic({ id: "a", examDate, estimatedMinutes: 240, difficulty: 5, importance: 5 })],
      { startDate: start, dailyMinutes: 60, horizonDays: 14 },
    );

    for (const item of plan) {
      expect(item.date <= examDate).toBe(true);
    }
  });

  it("reserves revision and a practice quiz for the pre-exam window", () => {
    const plan = buildPlan(
      [
        topic({
          id: "a",
          examDate: "2026-01-15",
          estimatedMinutes: 120,
          status: "studied",
          masteryScore: 60,
        }),
        topic({
          id: "b",
          subjectId: "s2",
          subjectName: "Maths",
          examDate: "2026-01-15",
          estimatedMinutes: 120,
          status: "revised",
          masteryScore: 70,
        }),
      ],
      { startDate: start, dailyMinutes: 120, horizonDays: 12 },
    );

    // 10 days out → the last two days are the revision window.
    const finalWindow = plan.filter(
      (item) => item.date >= "2026-01-13" && item.date <= "2026-01-15",
    );
    expect(finalWindow.some((item) => item.kind === "revision")).toBe(true);
    expect(finalWindow.some((item) => item.kind === "quiz")).toBe(true);

    for (const item of plan) {
      expect(item.date <= "2026-01-15").toBe(true);
    }
  });

  it("prioritises urgent exams over distant ones", () => {
    const soon = topic({ id: "soon", examDate: "2026-01-08", difficulty: 4, importance: 4 });
    const later = topic({ id: "later", examDate: "2026-03-01", difficulty: 4, importance: 4 });

    expect(topicPriority(soon, start)).toBeGreaterThan(topicPriority(later, start));
  });

  it("splits long topics across several days", () => {
    const plan = buildPlan([topic({ id: "a", estimatedMinutes: 300, examDate: "2026-01-15" })], {
      startDate: start,
      dailyMinutes: 60,
      horizonDays: 10,
    });

    const days = new Set(plan.map((item) => item.date));
    expect(days.size).toBeGreaterThan(1);
    expect(plan.every((item) => item.minutes <= 60)).toBe(true);
  });

  it("spreads a small workload across the runway instead of day one", () => {
    // The bug this guards: two 60-minute topics both landing on the first day
    // even though the exam was weeks away.
    const plan = buildPlan(
      [topic({ id: "a", estimatedMinutes: 60, examDate: "2026-01-15" })],
      { startDate: start, dailyMinutes: 120, horizonDays: 12 },
    );

    const study = plan.filter((item) => item.kind === "study");
    const studyDays = new Set(study.map((item) => item.date));
    const daily = byDay(study);

    expect(study.reduce((sum, item) => sum + item.minutes, 0)).toBe(60);
    expect(studyDays.size).toBeGreaterThan(2);
    // A small starter block today, then the rest paced across the runway.
    expect(study[0]?.date).toBe("2026-01-05");
    expect(daily.get("2026-01-05")).toBeLessThanOrEqual(20);
    expect(Math.max(...daily.values())).toBeLessThan(60);
    expect(study.every((item) => item.date <= "2026-01-15")).toBe(true);
  });

  it("keeps new material out of the pre-exam revision window", () => {
    const examDate = "2026-01-15"; // 10 days out → 2 revision days
    const plan = buildPlan(
      [topic({ id: "a", estimatedMinutes: 120, examDate, status: "studied" })],
      { startDate: start, dailyMinutes: 120, horizonDays: 12 },
    );

    const study = plan.filter((item) => item.kind === "study");
    expect(study.length).toBeGreaterThan(0);
    for (const item of study) {
      expect(item.date <= "2026-01-12").toBe(true);
    }
  });

  it("spaces revision through the runway, not only in exam week", () => {
    const plan = buildPlan(
      [
        topic({
          id: "a",
          estimatedMinutes: 120,
          examDate: "2026-01-25", // 20 days out → 4-day revision window
          status: "studied",
        }),
      ],
      { startDate: start, dailyMinutes: 120, horizonDays: 22 },
    );

    const revisionDates = new Set(
      plan.filter((item) => item.kind === "revision").map((item) => item.date),
    );
    expect(revisionDates.size).toBeGreaterThan(2);
    // At least one revision block happens well before the final window.
    expect([...revisionDates].some((date) => date < "2026-01-21")).toBe(true);
  });

  it("fills every runway day with study, revision or a quiz", () => {
    const plan = buildPlan(
      [
        topic({
          id: "a",
          estimatedMinutes: 90,
          examDate: "2026-01-15",
          status: "studied",
        }),
      ],
      { startDate: start, dailyMinutes: 120, horizonDays: 11 },
    );

    const plannedDays = new Set(plan.map((item) => item.date));
    for (let index = 0; index < 11; index++) {
      const key = addDays(start, index);
      const y = key.getFullYear();
      const m = `${key.getMonth() + 1}`.padStart(2, "0");
      const d = `${key.getDate()}`.padStart(2, "0");
      expect(plannedDays.has(`${y}-${m}-${d}`)).toBe(true);
    }
  });

  it("rotates revision across every topic instead of repeating the weakest", () => {
    const examDate = "2026-01-15";
    const topics = ["a", "b", "c", "d"].map((id, index) =>
      topic({
        id,
        name: `Topic ${id}`,
        estimatedMinutes: 60,
        examDate,
        status: "studied",
        masteryScore: index === 0 ? 55 : index * 5,
      }),
    );

    const plan = buildPlan(topics, {
      startDate: start,
      dailyMinutes: 120,
      horizonDays: 12,
    });

    const revised = new Set(
      plan.filter((item) => item.kind === "revision").map((item) => item.topicId),
    );
    expect(revised.size).toBe(topics.length);
  });

  it("never books the same topic for revision twice in one day", () => {
    const plan = buildPlan(
      [
        topic({
          id: "a",
          estimatedMinutes: 120,
          examDate: "2026-02-04", // 30 days out → capped 5-day revision window
          status: "studied",
        }),
      ],
      { startDate: start, dailyMinutes: 120, horizonDays: 32 },
    );

    const revisionKeys = plan
      .filter((item) => item.kind === "revision")
      .map((item) => `${item.date}:${item.topicId}`);

    expect(revisionKeys.length).toBeGreaterThan(1);
    expect(new Set(revisionKeys).size).toBe(revisionKeys.length);
  });

  it("shares one daily budget across study, revision and quizzes", () => {
    const plan = buildPlan(
      [
        topic({ id: "a", estimatedMinutes: 180, examDate: "2026-01-11" }),
        topic({
          id: "b",
          subjectId: "s2",
          subjectName: "Maths",
          estimatedMinutes: 180,
          examDate: "2026-01-11",
          status: "studied",
        }),
      ],
      { startDate: start, dailyMinutes: 60, horizonDays: 10 },
    );

    for (const minutes of byDay(plan).values()) {
      expect(minutes).toBeLessThanOrEqual(60);
    }
  });

  it("gives each day sequential start times from the preferred hour", () => {
    const plan = buildPlan(
      [
        topic({ id: "a", examDate: "2026-01-15", estimatedMinutes: 120 }),
        topic({
          id: "b",
          subjectId: "s2",
          subjectName: "Maths",
          examDate: "2026-01-15",
          estimatedMinutes: 120,
        }),
      ],
      {
        startDate: start,
        dailyMinutes: 120,
        horizonDays: 3,
        dayStartMinute: 18 * 60,
      },
    );

    const byDate = new Map<string, typeof plan>();
    for (const item of plan) {
      byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
    }

    for (const items of byDate.values()) {
      let expected = 18 * 60;
      for (const item of items) {
        expect(item.startTime).toBe(minuteToClock(expected));
        expected += item.minutes + 5;
      }
    }
  });

  it("schedules nothing for an exam that has already passed", () => {
    const plan = buildPlan(
      [topic({ id: "a", examDate: "2026-01-03", estimatedMinutes: 120 })],
      { startDate: start, dailyMinutes: 120, horizonDays: 10 },
    );

    expect(plan).toEqual([]);
  });

  it("never schedules a subject that has no dated test", () => {
    const plan = buildPlan(
      [
        topic({ id: "examined", examDate: "2026-01-12", estimatedMinutes: 120 }),
        topic({
          id: "container-only",
          subjectId: "s2",
          subjectName: "Geography",
          examDate: null,
          estimatedMinutes: 120,
        }),
      ],
      { startDate: start, dailyMinutes: 120, horizonDays: 10 },
    );

    expect(plan.length).toBeGreaterThan(0);
    expect(plan.every((item) => item.topicId === "examined")).toBe(true);
  });
});

describe("explainable priority", () => {
  it("explains exam proximity, difficulty and syllabus incompleteness", () => {
    const breakdown = topicPriorityBreakdown(
      topic({
        examDate: "2026-01-12", // 7 days after the start date
        difficulty: 5,
        subjectDifficulty: 5,
        syllabusTotal: 20,
        syllabusCompleted: 7,
        prepLevel: "beginner",
      }),
      start,
    );

    expect(breakdown.daysToExam).toBe(7);
    expect(breakdown.reasons).toContain("Exam in 7 days");
    expect(breakdown.reasons).toContain("Very difficult");
    expect(breakdown.reasons).toContain("65% syllabus incomplete");
    expect(breakdown.reasons).toContain("Beginner preparation");
  });

  it("raises priority for a difficult subject even when urgency is equal", () => {
    const easy = topicPriority(
      topic({ examDate: "2026-01-15", subjectDifficulty: 1, difficulty: 3 }),
      start,
    );
    const hard = topicPriority(
      topic({ examDate: "2026-01-15", subjectDifficulty: 5, difficulty: 3 }),
      start,
    );
    expect(hard).toBeGreaterThan(easy);
  });

  it("boosts weak topics and de-prioritises mastered ones", () => {
    const base = topic({ examDate: "2026-01-15", masteryScore: 55 });
    const weak = topicPriority({ ...base, weak: true }, start);
    const normal = topicPriority(base, start);
    const mastered = topicPriority({ ...base, masteryScore: 92 }, start);

    expect(weak).toBeGreaterThan(normal);
    expect(mastered).toBeLessThan(normal);
  });

  it("raises priority when recent quiz accuracy is poor", () => {
    const good = topicPriority(
      topic({ examDate: "2026-01-15", quizAccuracy: 90 }),
      start,
    );
    const poor = topicPriority(
      topic({ examDate: "2026-01-15", quizAccuracy: 20 }),
      start,
    );
    expect(poor).toBeGreaterThan(good);
  });

  it("labels the 1–5 difficulty scale consistently", () => {
    expect(difficultyLabel(1)).toBe("Easy");
    expect(difficultyLabel(3)).toBe("Moderate");
    expect(difficultyLabel(4)).toBe("Difficult");
    expect(difficultyLabel(5)).toBe("Very difficult");
  });
});

describe("multi-exam sequencing", () => {
  it("plans exams one after another: the later exam starts the day after the earlier one", () => {
    const plan = buildPlan(
      [
        topic({
          id: "urgent",
          subjectId: "easy",
          subjectName: "History",
          examDate: "2026-01-08",
          difficulty: 2,
          subjectDifficulty: 2,
          importance: 3,
          estimatedMinutes: 240,
          prepLevel: "advanced",
        }),
        topic({
          id: "later",
          subjectId: "hard",
          subjectName: "Mathematics",
          examDate: "2026-01-15",
          difficulty: 5,
          subjectDifficulty: 5,
          importance: 5,
          estimatedMinutes: 360,
          prepLevel: "beginner",
        }),
      ],
      { startDate: start, dailyMinutes: 120, horizonDays: 20 },
    );

    // Every day through the first exam belongs to the first exam only —
    // the later exam gets none of those days, however difficult it is.
    const before = plan.filter((item) => item.date <= "2026-01-08");
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((item) => item.subjectId === "easy")).toBe(true);

    // The day after the first exam is the second exam's first work day.
    const after = plan.filter((item) => item.date >= "2026-01-09");
    expect(after.some((item) => item.subjectId === "hard" && item.kind === "study")).toBe(true);
    expect(after.every((item) => item.subjectId === "hard")).toBe(true);
  });

  it("gives a far exam no time until every nearer exam has been prepared", () => {
    const plan = buildPlan(
      [
        topic({
          id: "urgent",
          subjectId: "easy",
          subjectName: "History",
          examDate: "2026-01-08",
          difficulty: 2,
          estimatedMinutes: 240,
        }),
        topic({
          id: "later",
          subjectId: "hard",
          subjectName: "Mathematics",
          examDate: "2026-01-24", // 19 days out
          difficulty: 5,
          estimatedMinutes: 360,
        }),
      ],
      { startDate: start, dailyMinutes: 120, horizonDays: 20 },
    );

    // While the near test is being prepared, the far test gets no time.
    const beforeNearest = plan.filter(
      (item) => item.date >= "2026-01-05" && item.date <= "2026-01-08",
    );
    expect(beforeNearest.some((item) => item.subjectId === "hard")).toBe(false);

    // Once the near test has passed, the far test becomes the focus.
    const afterNearest = plan.filter((item) => item.date > "2026-01-08");
    expect(
      afterNearest.some(
        (item) => item.subjectId === "hard" && item.kind === "study",
      ),
    ).toBe(true);
  });

  it("plans three exams 5/10/15 days out strictly one after another", () => {
    const plan = buildPlan(
      [
        topic({
          id: "e1",
          subjectId: "s1",
          subjectName: "One",
          examDate: "2026-01-10",
          estimatedMinutes: 60,
        }),
        topic({
          id: "e2",
          subjectId: "s2",
          subjectName: "Two",
          examDate: "2026-01-15",
          estimatedMinutes: 60,
        }),
        topic({
          id: "e3",
          subjectId: "s3",
          subjectName: "Three",
          examDate: "2026-01-20",
          estimatedMinutes: 60,
        }),
      ],
      { startDate: start, dailyMinutes: 120, horizonDays: 16 },
    );

    // Every day before exam 1 (through its date) contains only exam 1's
    // topics — no content from the exams 10 or 15 days away.
    const before = plan.filter((item) => item.date <= "2026-01-10");
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((item) => item.subjectId === "s1")).toBe(true);

    // The next day flips to exam 2's topics.
    const dayAfter = plan.filter((item) => item.date === "2026-01-11");
    expect(dayAfter.length).toBeGreaterThan(0);
    expect(dayAfter.every((item) => item.subjectId === "s2")).toBe(true);

    // At least the last 2 days before exam 2 contain only exam 2's topics.
    const beforeSecond = plan.filter(
      (item) => item.date >= "2026-01-14" && item.date <= "2026-01-15",
    );
    expect(beforeSecond.length).toBeGreaterThan(0);
    expect(beforeSecond.every((item) => item.subjectId === "s2")).toBe(true);

    // Same for exam 3.
    const beforeThird = plan.filter(
      (item) => item.date >= "2026-01-19" && item.date <= "2026-01-20",
    );
    expect(beforeThird.length).toBeGreaterThan(0);
    expect(beforeThird.every((item) => item.subjectId === "s3")).toBe(true);
  });

  it("never revises a topic before it has been given study time", () => {
    const plan = buildPlan(
      [
        topic({
          id: "fresh",
          examDate: "2026-01-12",
          estimatedMinutes: 90,
        }),
        topic({
          id: "already",
          subjectId: "s2",
          subjectName: "Maths",
          examDate: "2026-01-12",
          estimatedMinutes: 90,
          status: "studied",
        }),
      ],
      { startDate: start, dailyMinutes: 120, horizonDays: 8 },
    );

    const firstStudy = new Map<string, string>();
    for (const item of plan) {
      if (item.kind === "study" && !firstStudy.has(item.topicId)) {
        firstStudy.set(item.topicId, item.date);
      }
    }

    // A revision block may only appear after the topic's first study block
    // (or for topics that were already studied when the plan was built).
    for (const item of plan.filter((entry) => entry.kind === "revision")) {
      const first = firstStudy.get(item.topicId);
      const ok =
        item.topicId === "already" || (first !== undefined && first < item.date);
      expect(ok, `revision of ${item.topicId} on ${item.date} before study`).toBe(true);
    }

    // The never-studied topic gets real study blocks, not relabelled revision.
    expect(plan.some((item) => item.topicId === "fresh" && item.kind === "study")).toBe(
      true,
    );
  });

  it("gives the whole day before an exam to that exam only", () => {
    const plan = buildPlan(
      [
        topic({
          id: "tomorrow",
          subjectId: "a",
          subjectName: "Biology",
          examDate: "2026-01-06",
          estimatedMinutes: 180,
        }),
        topic({
          id: "next-week",
          subjectId: "b",
          subjectName: "Chemistry",
          examDate: "2026-01-12",
          estimatedMinutes: 180,
        }),
      ],
      { startDate: start, dailyMinutes: 120, horizonDays: 10 },
    );

    const dayBefore = plan.filter((item) => item.date === "2026-01-05");
    expect(dayBefore.length).toBeGreaterThan(0);
    expect(dayBefore.every((item) => item.subjectId === "a")).toBe(true);
  });

  it("keeps only the exams happening tomorrow on the day before", () => {
    const plan = buildPlan(
      [
        topic({
          id: "tomorrow-a",
          subjectId: "a",
          subjectName: "Biology",
          examDate: "2026-01-06",
          estimatedMinutes: 120,
        }),
        topic({
          id: "tomorrow-b",
          subjectId: "b",
          subjectName: "Chemistry",
          examDate: "2026-01-06",
          estimatedMinutes: 120,
        }),
        topic({
          id: "later",
          subjectId: "c",
          subjectName: "Physics",
          examDate: "2026-01-20",
          estimatedMinutes: 120,
        }),
      ],
      { startDate: start, dailyMinutes: 120, horizonDays: 10 },
    );

    const dayBefore = plan.filter((item) => item.date === "2026-01-05");
    const subjects = new Set(dayBefore.map((item) => item.subjectId));
    expect(subjects).toEqual(new Set(["a", "b"]));
  });

  it("runs the roadmap through the last upcoming exam, not just the first", () => {
    const plan = buildPlan(
      [
        topic({
          id: "first",
          subjectId: "a",
          subjectName: "Biology",
          examDate: "2026-01-08",
          estimatedMinutes: 180,
          status: "studied",
        }),
        topic({
          id: "last",
          subjectId: "b",
          subjectName: "Chemistry",
          examDate: "2026-01-20",
          estimatedMinutes: 240,
        }),
      ],
      { startDate: start, dailyMinutes: 120 },
    );

    expect(plan.some((item) => item.date > "2026-01-08")).toBe(true);
    expect(plan.some((item) => item.date === "2026-01-20")).toBe(true);
    expect(plan.every((item) => item.date <= "2026-01-20")).toBe(true);
  });

  it("keeps the day before a later exam of the same subject exclusive", () => {
    const shared = topic({
      id: "cells",
      subjectId: "bio",
      subjectName: "Biology",
      estimatedMinutes: 240,
    });

    const plan = buildPlan(
      [
        { ...shared, examId: "mock", examDate: "2026-01-08" },
        { ...shared, examId: "final", examDate: "2026-01-20" },
        topic({
          id: "chem",
          subjectId: "chem",
          subjectName: "Chemistry",
          examId: "chem-exam",
          examDate: "2026-01-25",
          estimatedMinutes: 180,
        }),
      ],
      { startDate: start, dailyMinutes: 120, horizonDays: 21 },
    );

    // The shared topic appears again after the mock has passed, so the final
    // exam has a real track of its own.
    expect(
      plan.some(
        (item) => item.subjectId === "bio" && item.date > "2026-01-08",
      ),
    ).toBe(true);

    // 19 Jan is the day before the Biology final. Chemistry's exam is later,
    // so nothing from Chemistry may appear that day.
    const dayBefore = plan.filter((item) => item.date === "2026-01-19");
    expect(dayBefore.length).toBeGreaterThan(0);
    expect(dayBefore.every((item) => item.subjectId === "bio")).toBe(true);
  });

  it("tracks multiple tests of the same subject independently", () => {
    const plan = buildPlan(
      [
        topic({
          id: "unit-a",
          subjectId: "s1",
          subjectName: "Biology",
          examId: "unit",
          examDate: "2026-01-10",
          estimatedMinutes: 180,
        }),
        topic({
          id: "final-b",
          subjectId: "s1",
          subjectName: "Biology",
          examId: "final",
          examDate: "2026-01-25",
          estimatedMinutes: 180,
        }),
      ],
      { startDate: start, dailyMinutes: 120, horizonDays: 21 },
    );

    const unit = plan.filter((item) => item.topicId === "unit-a");
    const final = plan.filter((item) => item.topicId === "final-b");

    expect(unit.length).toBeGreaterThan(0);
    expect(final.length).toBeGreaterThan(0);
    // The unit-test topic is finished by its own deadline.
    expect(unit.every((item) => item.date <= "2026-01-10")).toBe(true);
    // The final's topic waits until it is within the focus window.
    expect(final.some((item) => item.date > "2026-01-10")).toBe(true);
    expect(final.every((item) => item.date <= "2026-01-25")).toBe(true);
  });

  it("reserves revision for each exam separately", () => {
    const plan = buildPlan(
      [
        topic({
          id: "a",
          subjectId: "s1",
          subjectName: "Biology",
          examDate: "2026-01-12",
          estimatedMinutes: 180,
          status: "studied",
        }),
        topic({
          id: "b",
          subjectId: "s2",
          subjectName: "Chemistry",
          examDate: "2026-01-22",
          estimatedMinutes: 180,
          status: "studied",
        }),
      ],
      { startDate: start, dailyMinutes: 120, horizonDays: 20 },
    );

    expect(plan.some((item) => item.date === "2026-01-11" && item.kind === "revision")).toBe(
      true,
    );
    expect(plan.some((item) => item.date === "2026-01-21" && item.kind === "revision")).toBe(
      true,
    );
    expect(plan.some((item) => item.date === "2026-01-21" && item.subjectId === "s1")).toBe(
      false,
    );
  });

  it("redistributes unfinished work when the exam date moves closer", () => {
    const topics = [topic({ id: "a", estimatedMinutes: 240 })];
    const far = buildPlan(topics.map((entry) => ({ ...entry, examDate: "2026-01-25" })), {
      startDate: start,
      dailyMinutes: 120,
      horizonDays: 22,
    });
    const near = buildPlan(topics.map((entry) => ({ ...entry, examDate: "2026-01-10" })), {
      startDate: start,
      dailyMinutes: 120,
      horizonDays: 22,
    });

    const farStudyDays = new Set(
      far.filter((item) => item.kind === "study").map((item) => item.date),
    );
    const nearStudyDays = new Set(
      near.filter((item) => item.kind === "study").map((item) => item.date),
    );

    // A nearer deadline compresses study into fewer, earlier days.
    expect(nearStudyDays.size).toBeLessThan(farStudyDays.size);
    expect(near.every((item) => item.date <= "2026-01-10")).toBe(true);
  });

  it("does not re-book completed minutes as new work", () => {
    const plan = buildPlan(
      [
        topic({
          id: "a",
          estimatedMinutes: 120,
          completedMinutes: 120,
          status: "studied",
          examDate: "2026-01-15",
        }),
      ],
      { startDate: start, dailyMinutes: 120, horizonDays: 12 },
    );

    expect(plan.some((item) => item.kind === "study")).toBe(false);
    expect(plan.every((item) => item.kind === "revision" || item.kind === "quiz")).toBe(
      true,
    );
  });
});

describe("clock helpers", () => {
  it("round-trips HH:mm values", () => {
    expect(minuteToClock(18 * 60)).toBe("18:00");
    expect(minuteToClock(18 * 60 + 65)).toBe("19:05");
    expect(clockToMinute("07:30")).toBe(450);
    expect(clockToMinute("not-a-time")).toBe(18 * 60);
    expect(clockToMinute(null)).toBe(18 * 60);
  });

  it("wraps past midnight", () => {
    expect(minuteToClock(24 * 60 + 30)).toBe("00:30");
  });
});

describe("revisionWindowDays", () => {
  it("scales with the runway and stays between 2 and 5 days", () => {
    expect(revisionWindowDays(0)).toBe(0);
    expect(revisionWindowDays(3)).toBe(2);
    expect(revisionWindowDays(10)).toBe(2);
    expect(revisionWindowDays(20)).toBe(4);
    expect(revisionWindowDays(30)).toBe(5);
    expect(revisionWindowDays(90)).toBe(5);
  });
});

describe("plan dates", () => {
  it("starts on the requested day and moves forward", () => {
    const plan = buildPlan([topic({ estimatedMinutes: 120, examDate: "2026-01-10" })], {
      startDate: start,
      dailyMinutes: 60,
      horizonDays: 4,
    });
    const first = plan[0]?.date;
    expect(first).toBe("2026-01-05");
    const lastDate = addDays(start, 3);
    expect(plan.every((item) => item.date <= "2026-01-08")).toBe(true);
    expect(lastDate.getDate()).toBe(8);
  });
});

describe("capacityShortfalls", () => {
  const capacityTopic = (overrides: Partial<CapacityTopic> = {}): CapacityTopic => ({
    id: "t1",
    subjectId: "s1",
    subjectName: "Biology",
    subjectColor: "mint",
    estimatedMinutes: 60,
    completedMinutes: 0,
    examDate: "2026-01-15",
    examId: "e1",
    status: "not_started",
    ...overrides,
  });

  it("returns no shortfall when the material fits the runway", () => {
    // 10 days of runway, 90 usable minutes/day ≫ one 60-minute topic.
    const report = capacityShortfalls([capacityTopic()], {
      startDate: start,
      dailyMinutes: 90,
    });
    expect(report).toHaveLength(1);
    expect(report[0].shortfallMinutes).toBe(0);
    expect(report[0].studyDays).toBeGreaterThan(0);
  });

  it("flags a shortfall when the day budget cannot cover the material", () => {
    const report = capacityShortfalls(
      [capacityTopic({ estimatedMinutes: 600 })],
      { startDate: start, dailyMinutes: 60 },
    );
    expect(report[0].shortfallMinutes).toBeGreaterThan(0);
    expect(report[0].requiredMinutes).toBe(600);
  });

  it("respects the revision-window reservation and exam-day plans", () => {
    // Exam tomorrow: no new material can enter the plan at all.
    const report = capacityShortfalls(
      [
        capacityTopic({
          estimatedMinutes: 120,
          examDate: "2026-01-06",
        }),
      ],
      { startDate: start, dailyMinutes: 120 },
    );
    expect(report[0].studyDays).toBe(0);
    expect(report[0].shortfallMinutes).toBe(120);
    expect(report[0].examInDays).toBe(1);
  });

  it("excludes mastered topics from the required minutes", () => {
    const report = capacityShortfalls(
      [capacityTopic({ status: "mastered", estimatedMinutes: 600 })],
      { startDate: start, dailyMinutes: 60 },
    );
    expect(report[0].requiredMinutes).toBe(0);
    expect(report[0].shortfallMinutes).toBe(0);
  });

  it("gives later exams only the days left after earlier exams", () => {
    const report = capacityShortfalls(
      [
        capacityTopic({
          id: "a",
          examId: "e1",
          examDate: "2026-01-08",
          estimatedMinutes: 60,
        }),
        capacityTopic({
          id: "b",
          examId: "e2",
          subjectId: "s2",
          subjectName: "Chemistry",
          examDate: "2026-01-15",
          estimatedMinutes: 60,
        }),
      ],
      { startDate: start, dailyMinutes: 90 },
    );

    const first = report.find((entry) => entry.examId === "e1");
    const second = report.find((entry) => entry.examId === "e2");
    // e1: Jan 5 only — its revision window starts Jan 6.
    expect(first?.studyDays).toBe(1);
    // e2's days start only after e1's date: Jan 9–12 (revision window Jan 13+).
    expect(second?.studyDays).toBe(4);
    expect(second?.shortfallMinutes).toBe(0);
  });

  it("flags a later exam as short once earlier exams consume the calendar", () => {
    const report = capacityShortfalls(
      [
        capacityTopic({
          id: "a",
          examId: "e1",
          examDate: "2026-01-10",
          estimatedMinutes: 30,
        }),
        capacityTopic({
          id: "b",
          examId: "e2",
          subjectId: "s2",
          subjectName: "Chemistry",
          examDate: "2026-01-15",
          estimatedMinutes: 600,
        }),
      ],
      { startDate: start, dailyMinutes: 60 },
    );

    const second = report.find((entry) => entry.examId === "e2");
    // e2's study days: Jan 11–12 only → 2 days × 20 usable minutes.
    expect(second?.studyDays).toBe(2);
    expect(second?.availableMinutes).toBe(40);
    expect(second?.shortfallMinutes).toBe(560);
  });
});
