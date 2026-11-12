import { normalizeAnswer } from "@/lib/utils";
import { parseMatchPairs } from "@/lib/quiz-rules";

function keywordOverlap(correctText: string, responseText: string) {
  const correctTokens = correctText.split(" ").filter((token) => token.length > 3);
  if (correctTokens.length === 0) return 0;

  const responseTokens = new Set(responseText.split(" ").filter((token) => token.length > 3));
  const overlap = correctTokens.filter((token) => responseTokens.has(token)).length;
  return overlap / correctTokens.length;
}

/**
 * Match answers are posted as a JSON array of selected right-hand choices in
 * the same order as the left-hand terms. A question counts as correct only
 * when every pair matches.
 */
function matchMatches(correctAnswer: string, response: string) {
  const pairs = parseMatchPairs(correctAnswer);
  if (pairs.length === 0) return false;

  let selected: unknown;
  try {
    selected = JSON.parse(response);
  } catch {
    return false;
  }
  if (!Array.isArray(selected) || selected.length !== pairs.length) return false;

  return pairs.every((pair, index) => {
    const chosen = normalizeAnswer(String(selected[index] ?? ""));
    return Boolean(chosen) && chosen === normalizeAnswer(pair.right);
  });
}

export function isAnswerCorrect(
  type: string,
  correctAnswer: string,
  response: string,
): boolean {
  const responseText = normalizeAnswer(response);
  const correctText = normalizeAnswer(correctAnswer);

  if (!responseText) return false;

  if (type === "match") return matchMatches(correctAnswer, response);

  if (responseText === correctText) return true;

  if (type === "short" || type === "long" || type === "application" || type === "problem") {
    // A short answer may literally contain the model answer.
    if (type === "short" && correctText.includes(responseText) && responseText.length >= 4) {
      return true;
    }

    // Longer answers are paraphrased, so require a lower overlap threshold but
    // still enough shared technical vocabulary to show real understanding.
    const threshold = type === "short" ? 0.6 : 0.4;
    const minimumResponseLength = type === "short" ? 0 : 10;
    if (responseText.length < minimumResponseLength) return false;
    return keywordOverlap(correctText, responseText) >= threshold;
  }

  return false;
}

export function gradeLabel(score: number) {
  if (score >= 90) return { label: "Excellent", tone: "mint" as const };
  if (score >= 75) return { label: "Strong", tone: "sky" as const };
  if (score >= 60) return { label: "Getting there", tone: "amber" as const };
  return { label: "Needs revision", tone: "pink" as const };
}
