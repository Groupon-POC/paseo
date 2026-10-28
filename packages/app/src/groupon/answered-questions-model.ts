// Added for Groupon Desk (fork of Paseo, Apache-2.0): what a question call (AskUserQuestion) was answered, read back from its result for the chat's history.

/**
 * A question call's answers, read back for the chat's history, so the answered form can show
 * which options were picked.
 *
 * Responsibilities:
 * - `readQuestionAnswers`: the answers a call's result carries, keyed by the question's text
 * - `answeredQuestions`: each question with the options its answer picked and any answer of the
 *   person's own words
 *
 * Constraints:
 * - Pure: the result is read as untrusted data; anything it does not carry is simply unanswered
 */

import type { QuestionFormQuestion } from "@/components/question-form-card-core";

export interface AnsweredQuestion {
  question: QuestionFormQuestion;
  /** The indexes of the options the answer picked. */
  selected: ReadonlySet<number>;
  /** An answer in the person's own words, beside or instead of the options; null when none. */
  ownAnswer: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The result's text: a string, or the text blocks a provider hands back. */
function textOf(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return output.map(textOf).join("\n");
  if (isRecord(output) && typeof output.text === "string") return output.text;
  if (isRecord(output) && output.content !== undefined) return textOf(output.content);
  return "";
}

/**
 * The answers a question call's result carries, keyed by each question's text: an `answers`
 * record when the result is structured, else Claude Code's sentence
 * `... "<question>"="<answer>", "<question>"="<answer>". ...`.
 */
export function readQuestionAnswers(output: unknown): Record<string, string> {
  if (isRecord(output) && isRecord(output.answers)) {
    return Object.fromEntries(
      Object.entries(output.answers).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  }
  const answers: Record<string, string> = {};
  for (const match of textOf(output).matchAll(/"((?:[^"\\]|\\.)*)"="((?:[^"\\]|\\.)*)"/g)) {
    const [, question, answer] = match;
    if (question !== undefined && answer !== undefined) answers[question] = answer;
  }
  return answers;
}

/** Each question with what its answer picked: options by their labels, the rest as the person's own words. */
export function answeredQuestions(
  questions: readonly QuestionFormQuestion[],
  answers: Readonly<Record<string, string>>,
): AnsweredQuestion[] {
  return questions.map((question) => {
    const answer = answers[question.question] ?? answers[question.header];
    if (answer === undefined) return { question, selected: new Set<number>(), ownAnswer: null };
    const picked = question.multiSelect ? answer.split(", ") : [answer];
    const labels = question.options.map((option) => option.label);
    const selected = new Set(
      labels.flatMap((label, index) => (picked.includes(label) ? [index] : [])),
    );
    const own = picked.filter((part) => part.length > 0 && !labels.includes(part));
    return { question, selected, ownAnswer: own.length > 0 ? own.join(", ") : null };
  });
}
