// Changed for Groupon Desk (fork of Paseo, Apache-2.0): a shell call titled by its `description`; a question call titled Question.
import { describe, expect, it } from "vitest";

import { buildToolCallDisplayModel } from "./tool-call-display.js";

describe("shared tool-call display mapping", () => {
  it("titles a shell call by its description only when asked to", () => {
    const input = {
      name: "Bash",
      status: "completed" as const,
      error: null,
      detail: { type: "shell" as const, command: "pnpm test", description: "Run the unit tests" },
    };
    expect(buildToolCallDisplayModel(input).summary).toBe("pnpm test");
    expect(buildToolCallDisplayModel({ ...input, preferDescription: true }).summary).toBe(
      "Run the unit tests",
    );
    expect(
      buildToolCallDisplayModel({
        ...input,
        detail: { type: "shell", command: "ls" },
        preferDescription: true,
      }).summary,
    ).toBe("ls");
  });

  it("titles a question call Question, with its questions' headers", () => {
    const display = buildToolCallDisplayModel({
      name: "AskUserQuestion",
      status: "completed",
      error: null,
      detail: {
        type: "unknown",
        input: {
          questions: [
            { header: "Same-proj wt", question: "Who makes the worktree?", options: [] },
            { header: "Commit", question: "Commit what is done?", options: [] },
          ],
        },
        output: null,
      },
    });

    expect(display).toEqual({ displayName: "Question", summary: "Same-proj wt · Commit" });
  });

  it("titles a finished thought by how long it took, Thought when that is not known, and one still going Thinking", () => {
    const thought = {
      name: "thinking",
      error: null,
      detail: { type: "unknown" as const, input: "Weighing the two options", output: null },
      metadata: { thoughtSeconds: 12 },
    };

    expect(buildToolCallDisplayModel({ ...thought, status: "completed" }).displayName).toBe(
      "Thought for 12s",
    );
    expect(buildToolCallDisplayModel({ ...thought, status: "running" }).displayName).toBe(
      "Thinking",
    );
    expect(
      buildToolCallDisplayModel({ ...thought, status: "completed", metadata: undefined })
        .displayName,
    ).toBe("Thought");
  });

  it("builds summary from canonical detail", () => {
    const display = buildToolCallDisplayModel({
      name: "read_file",
      status: "running",
      error: null,
      detail: {
        type: "read",
        filePath: "/tmp/repo/src/index.ts",
      },
      cwd: "/tmp/repo",
    });

    expect(display).toEqual({
      displayName: "Read",
      summary: "src/index.ts",
    });
  });

  it("does not infer summaries from unknown raw detail", () => {
    const display = buildToolCallDisplayModel({
      name: "exec_command",
      status: "running",
      error: null,
      detail: {
        type: "unknown",
        input: { command: "npm test" },
        output: null,
      },
    });

    expect(display).toEqual({
      displayName: "Exec command",
    });
  });

  it("uses sub-agent detail for task label and description", () => {
    const display = buildToolCallDisplayModel({
      name: "task",
      status: "running",
      error: null,
      detail: {
        type: "sub_agent",
        subAgentType: "Explore",
        description: "Inspect repository structure",
        log: "[Read] README.md",
      },
    });

    expect(display).toEqual({
      displayName: "Explore",
      summary: "Inspect repository structure",
    });
  });

  it("builds display model for worktree setup detail", () => {
    const display = buildToolCallDisplayModel({
      name: "paseo_worktree_setup",
      status: "running",
      error: null,
      detail: {
        type: "worktree_setup",
        worktreePath: "/tmp/repo/.paseo/worktrees/repo/branch",
        branchName: "feature-branch",
        log: "==> [1/1] Running: npm install\n",
        commands: [
          {
            index: 1,
            command: "npm install",
            cwd: "/tmp/repo/.paseo/worktrees/repo/branch",
            log: "==> [1/1] Running: npm install\n",
            status: "running",
            exitCode: null,
          },
        ],
      },
    });

    expect(display).toEqual({
      displayName: "Worktree setup",
      summary: "feature-branch",
    });
  });

  it("provides errorText for failed calls", () => {
    const display = buildToolCallDisplayModel({
      name: "shell",
      status: "failed",
      error: { message: "boom" },
      detail: {
        type: "unknown",
        input: null,
        output: null,
      },
    });

    expect(display.errorText).toBe('{\n  "message": "boom"\n}');
  });

  it("labels terminal interaction rows without a summary when no command is available", () => {
    const display = buildToolCallDisplayModel({
      name: "terminal",
      status: "completed",
      error: null,
      detail: {
        type: "plain_text",
        icon: "square_terminal",
      },
    });

    expect(display).toEqual({
      displayName: "Terminal",
    });
  });

  it("uses the command as terminal interaction summary when available", () => {
    const display = buildToolCallDisplayModel({
      name: "terminal",
      status: "completed",
      error: null,
      detail: {
        type: "plain_text",
        label: "npm run test",
        icon: "square_terminal",
      },
    });

    expect(display).toEqual({
      displayName: "Terminal",
      summary: "npm run test",
    });
  });

  it("humanizes Paseo MCP tool names (Claude Code format)", () => {
    const display = buildToolCallDisplayModel({
      name: "mcp__paseo__create_agent",
      status: "running",
      error: null,
      detail: { type: "unknown", input: null, output: null },
    });
    expect(display.displayName).toBe("Create agent");
  });

  it("humanizes Paseo MCP tool names (Codex format)", () => {
    const display = buildToolCallDisplayModel({
      name: "paseo.create_agent",
      status: "running",
      error: null,
      detail: { type: "unknown", input: null, output: null },
    });
    expect(display.displayName).toBe("Create agent");
  });

  it("humanizes list_agents Paseo tool", () => {
    const display = buildToolCallDisplayModel({
      name: "mcp__paseo__list_agents",
      status: "running",
      error: null,
      detail: { type: "unknown", input: null, output: null },
    });
    expect(display.displayName).toBe("List agents");
  });

  it("does not override speak tool display name", () => {
    const display = buildToolCallDisplayModel({
      name: "speak",
      status: "running",
      error: null,
      detail: { type: "unknown", input: null, output: null },
    });
    expect(display.displayName).toBe("Speak");
  });

  it("labels plan detail rows as Plan", () => {
    const display = buildToolCallDisplayModel({
      name: "plan",
      status: "completed",
      error: null,
      detail: {
        type: "plan",
        text: "### Login Screen\n- Build layout",
      },
    });

    expect(display).toEqual({
      displayName: "Plan",
    });
  });
});
