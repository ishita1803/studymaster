/**
 * Pure helpers for deciding which exams select a given syllabus topic.
 *
 * An exam with no `ExamTopic` rows is a legacy whole-subject test: it covers
 * every approved leaf topic in that subject. An exam with rows only covers the
 * topics the student explicitly ticked. Keeping this logic pure makes the
 * "one track per exam" rule easy to test without a database.
 */

export type ExamTopicSelection = {
  examTopics: { topicId: string }[];
};

export function examSelectsTopic(
  exam: ExamTopicSelection,
  topicId: string,
): boolean {
  return (
    exam.examTopics.length === 0 ||
    exam.examTopics.some((entry) => entry.topicId === topicId)
  );
}

export function coveringExams<T extends ExamTopicSelection>(
  exams: T[],
  topicId: string,
): T[] {
  return exams.filter((exam) => examSelectsTopic(exam, topicId));
}
