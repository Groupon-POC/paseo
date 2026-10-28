// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for reading a question call's answers back.

import { describe, expect, it } from "vitest";
import type { QuestionFormQuestion } from "@/components/question-form-card-core";
import { answeredQuestions, readQuestionAnswers } from "./answered-questions-model";

const question = (overrides: Partial<QuestionFormQuestion>): QuestionFormQuestion => ({
  question: "Who makes the worktree?",
  header: "Same-proj wt",
  options: [{ label: "Desk adopts the agent's (Recommended)" }, { label: "Desk makes it" }],
  multiSelect: false,
  allowOther: true,
  allowEmpty: false,
  ...overrides,
});

describe("a question call's answers", () => {
  it("reads Claude Code's sentence, a quote and an equals sign per answer", () => {
    const answers = readQuestionAnswers(
      'Your questions have been answered: "Who makes the worktree?"="Desk adopts the agent\'s (Recommended)", "Commit what is done?"="Commit to the current branches". You can now continue with these answers in mind.',
    );

    expect(answers).toEqual({
      "Who makes the worktree?": "Desk adopts the agent's (Recommended)",
      "Commit what is done?": "Commit to the current branches",
    });
  });

  it("reads a structured result and text blocks, and nothing from a result that carries none", () => {
    expect(
      readQuestionAnswers({ answers: { "Who makes the worktree?": "Desk makes it", n: 3 } }),
    ).toEqual({
      "Who makes the worktree?": "Desk makes it",
    });
    expect(readQuestionAnswers([{ type: "text", text: '"A?"="Yes"' }])).toEqual({ "A?": "Yes" });
    expect(readQuestionAnswers(null)).toEqual({});
  });

  it("reads the answers from a history the daemon read back, wrapped once more", () => {
    expect(
      readQuestionAnswers({
        output:
          'Your questions have been answered: "Commit now?"="Yes, to the current branches". You can now continue.',
      }),
    ).toEqual({ "Commit now?": "Yes, to the current branches" });
  });

  it("marks the picked option, keeps an answer in the person's own words, and leaves an unanswered question empty", () => {
    const rows = answeredQuestions(
      [
        question({}),
        question({
          question: "Which parts?",
          header: "Parts",
          multiSelect: true,
          options: [{ label: "API" }, { label: "UI" }],
        }),
        question({ question: "Anything else?", header: "Else" }),
      ],
      { "Who makes the worktree?": "Desk makes it", "Which parts?": "UI, the docs too" },
    );

    expect(rows.map((row) => [[...row.selected], row.ownAnswer])).toEqual([
      [[1], null],
      [[1], "the docs too"],
      [[], null],
    ]);
  });
});
