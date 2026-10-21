// Added for Groupon Desk (fork of Paseo, Apache-2.0): Start a ticket's choices.
import { describe, expect, it } from "vitest";
import type { ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";
import type { JobAnswer } from "./desk-plugin-rpc";
import {
  agentChoices,
  defaultEffortId,
  defaultModelId,
  elapsedText,
  gaveUpText,
  normalizeTicketKey,
  repositoryChoices,
  runAfterClock,
  runAfterError,
  runAfterJob,
  runStarted,
  startProblem,
  stepOfJob,
  stepRows,
  TICKET_GIVE_UP_MS,
  type TicketRun,
} from "./start-ticket-model";

const CLAUDE: ProviderSnapshotEntry = {
  provider: "claude-a833dd2d",
  status: "ready",
  enabled: true,
  label: "Claude · c_tzaruba@groupon.com (Max)",
  models: [
    {
      provider: "claude-a833dd2d",
      id: "opus",
      label: "Opus",
      thinkingOptions: [
        { id: "medium", label: "Medium" },
        { id: "high", label: "High", isDefault: true },
      ],
    },
    { provider: "claude-a833dd2d", id: "haiku", label: "Haiku", isDefault: true },
    { provider: "claude-a833dd2d", id: "old", label: "Old", isSelectable: false },
  ],
};

describe("Start a ticket's choices", () => {
  // The CLI's own cases (packages/groupon-cli tests for normalizeTicketKey); the plugin's test
  // holds its copy equal to the CLI's function.
  it.each([
    ["ENC-1234", "ENC-1234"],
    ["enc-1234", "ENC-1234"],
    [" https://groupondev.atlassian.net/browse/ENC-1234 ", "ENC-1234"],
    ["https://groupondev.atlassian.net/browse/ENC-1234?focusedCommentId=1", "ENC-1234"],
    ["https://groupondev.atlassian.net/browse/ENC-1234/", "ENC-1234"],
    ["ENC-", null],
    ["fix the watch", null],
    ["", null],
  ])("reads %j as %s", (input, key) => {
    expect(normalizeTicketKey(input)).toBe(key);
  });

  it("offers the agents ready on this Mac, by their own label", () => {
    const entries: ProviderSnapshotEntry[] = [
      CLAUDE,
      { provider: "codex", status: "loading", enabled: true },
      { provider: "opencode", status: "ready", enabled: false },
    ];
    expect(agentChoices(entries)).toEqual([
      { id: "claude-a833dd2d", label: "Claude · c_tzaruba@groupon.com (Max)" },
    ]);
    expect(agentChoices(undefined)).toEqual([]);
  });

  it("starts from the page's model and effort when the agent has them, else the defaults", () => {
    expect(defaultModelId(CLAUDE, "opus")).toBe("opus");
    expect(defaultModelId(CLAUDE, "old")).toBe("haiku");
    expect(defaultModelId(CLAUDE, null)).toBe("haiku");
    const opus = CLAUDE.models?.[0];
    expect(defaultEffortId(opus, "medium")).toBe("medium");
    expect(defaultEffortId(opus, "max")).toBe("high");
    expect(defaultEffortId(CLAUDE.models?.[1], "high")).toBeNull();
  });

  it("offers the git projects with a checkout on this Mac", () => {
    const projects = [
      {
        viewKey: "a",
        projectName: "engineering-development",
        projectKind: "git",
        hosts: [{ serverId: "mac-1", iconWorkingDir: "/src/ed", projectId: "prj_1" }],
      },
      {
        viewKey: "b",
        projectName: "notes",
        projectKind: "directory",
        hosts: [{ serverId: "mac-1", iconWorkingDir: "/src/notes", projectId: "prj_2" }],
      },
      {
        viewKey: "c",
        projectName: "infra-development",
        projectKind: "git",
        hosts: [{ serverId: "mac-2", iconWorkingDir: "/src/infra", projectId: "prj_3" }],
      },
    ];
    expect(repositoryChoices(projects, "mac-1")).toEqual([
      { key: "a", label: "engineering-development", projectRoot: "/src/ed", projectId: "prj_1" },
    ]);
  });

  it("says what is missing before Start", () => {
    const repository = { key: "a", label: "ed", projectRoot: "/src/ed", projectId: null };
    expect(startProblem({ ticket: "", repository, provider: "claude", model: "opus" })).toMatch(
      /Type the ticket/,
    );
    expect(
      startProblem({ ticket: "fix it", repository, provider: "claude", model: "opus" }),
    ).toMatch(/not a ticket key/);
    expect(
      startProblem({ ticket: "ENC-1", repository: null, provider: "claude", model: "opus" }),
    ).toMatch(/repository/);
    expect(startProblem({ ticket: "ENC-1", repository, provider: null, model: null })).toMatch(
      /agent/,
    );
    expect(
      startProblem({ ticket: "ENC-1", repository, provider: "claude", model: "opus" }),
    ).toBeNull();
  });
});

const AIR = "Tomas--MacBook-Air.local";
const T0 = 1_792_596_668_000;

function job(patch: Partial<JobAnswer>): JobAnswer {
  return {
    jobId: "job-1",
    kind: "ticket-start",
    status: "running",
    phase: "Naming the branch of ENC-10333",
    step: "naming",
    error: null,
    clone: null,
    ticket: null,
    updatedAt: "2026-10-21T15:31:08.000Z",
    ...patch,
  };
}

const marks = (run: TicketRun) => stepRows(run).map((row) => `${row.label}: ${row.state}`);

describe("the run's steps", () => {
  it("starts on naming the branch, the other two pending", () => {
    const run = runStarted("ENC-10333", 1, T0);
    expect(run).toEqual({
      status: "running",
      attempt: 1,
      startedAt: T0,
      step: "naming",
      phase: "Naming the branch of ENC-10333",
    });
    expect(marks(run)).toEqual([
      "Naming the branch: current",
      "Grading the assignment: pending",
      "Starting the agent: pending",
    ]);
  });

  it("marks each step as the hand reports it, with the hand's sentence", () => {
    let run = runStarted("ENC-10333", 1, T0);
    run = runAfterJob(
      run,
      1,
      job({
        step: "grading",
        phase: "Grading ENC-10333 with Claude Code: step 2: Read docs/plan.md",
      }),
    );
    expect(run).toMatchObject({
      step: "grading",
      phase: "Grading ENC-10333 with Claude Code: step 2: Read docs/plan.md",
    });
    expect(marks(run)).toEqual([
      "Naming the branch: done",
      "Grading the assignment: current",
      "Starting the agent: pending",
    ]);
    run = runAfterJob(
      run,
      1,
      job({ step: "starting", phase: "Cutting the worktree on b/ENC-10333-x" }),
    );
    expect(marks(run)).toEqual([
      "Naming the branch: done",
      "Grading the assignment: done",
      "Starting the agent: current",
    ]);
  });

  it("reads the step off the sentence of a plugin older than the steps", () => {
    expect(
      stepOfJob({ phase: "Naming the branch of ENC-1, then grading its readiness" }, "naming"),
    ).toBe("naming");
    expect(
      stepOfJob({ phase: "Cutting the worktree on b/ENC-1-x and starting the agent" }, "naming"),
    ).toBe("starting");
    expect(stepOfJob({ phase: "anything", step: null }, "grading")).toBe("grading");
  });

  it("ends on the hand-back, the workspace, or the hand's own sentence with the step it stopped at", () => {
    const run = runAfterJob(
      runStarted("ENC-10333", 1, T0),
      1,
      job({ step: "grading", phase: "Grading" }),
    );
    const handedBack = {
      kind: "handed-back" as const,
      ticket: "ENC-10333",
      reason: "NOT READY: 5 questions on the ticket.",
      questions: [{ label: "Where", note: "Which service?" }],
      link: "https://groupondev.atlassian.net/browse/ENC-10333?focusedCommentId=10007738",
    };
    expect(runAfterJob(run, 1, job({ status: "done", ticket: handedBack }))).toEqual({
      status: "handed-back",
      attempt: 1,
      outcome: handedBack,
    });
    expect(
      runAfterJob(
        run,
        1,
        job({
          status: "done",
          step: "starting",
          ticket: {
            kind: "started",
            ticket: "ENC-10333",
            branch: "b",
            readiness: "READY",
            workspaceId: "wks_1",
            agentId: null,
          },
        }),
      ),
    ).toEqual({ status: "started", attempt: 1, workspaceId: "wks_1" });
    const failed = runAfterJob(
      run,
      1,
      job({
        status: "failed",
        step: "grading",
        error:
          "groupon ticket start ENC-10333 stopped: the assignment could not be graded: Claude Code did not finish grading within 4 minutes",
      }),
    );
    expect(failed).toEqual({
      status: "failed",
      attempt: 1,
      step: "grading",
      error:
        "groupon ticket start ENC-10333 stopped: the assignment could not be graded: Claude Code did not finish grading within 4 minutes",
    });
    expect(marks(failed)).toEqual([
      "Naming the branch: done",
      "Grading the assignment: stopped",
      "Starting the agent: pending",
    ]);
    expect(runAfterError(run, 1, "This Mac's daemon has no Groupon plugin")).toMatchObject({
      status: "failed",
      step: "grading",
      error: "This Mac's daemon has no Groupon plugin",
    });
  });

  it("never lets an answer for an earlier attempt change a later one", () => {
    const retried = runStarted("ENC-10333", 2, T0 + 60_000);
    expect(runAfterJob(retried, 1, job({ status: "failed", error: "old" }))).toBe(retried);
    expect(runAfterError(retried, 1, "old")).toBe(retried);
    const ended: TicketRun = { status: "gave-up", attempt: 1, step: "grading", error: "x" };
    expect(runAfterJob(ended, 1, job({ status: "done" }))).toBe(ended);
  });
});

describe("giving up after five minutes", () => {
  it("keeps waiting up to five minutes, then says the hand did not finish and on which step", () => {
    const run = runAfterJob(
      runStarted("ENC-10333", 1, T0),
      1,
      job({ step: "grading", phase: "Grading" }),
    );
    expect(runAfterClock(run, T0 + TICKET_GIVE_UP_MS - 1, AIR)).toBe(run);
    const given = runAfterClock(run, T0 + TICKET_GIVE_UP_MS, AIR);
    expect(given).toEqual({
      status: "gave-up",
      attempt: 1,
      step: "grading",
      error:
        "The hand did not finish: Grading the assignment, see the hand's log (~/.local/state/groupon/hand/serve.log on Tomas--MacBook-Air.local).",
    });
    expect(marks(given)).toEqual([
      "Naming the branch: done",
      "Grading the assignment: stopped",
      "Starting the agent: pending",
    ]);
  });

  it("is five minutes, and touches nothing that is not running", () => {
    expect(TICKET_GIVE_UP_MS).toBe(300_000);
    const idle: TicketRun = { status: "idle" };
    expect(runAfterClock(idle, T0 + 10 * TICKET_GIVE_UP_MS, AIR)).toBe(idle);
    expect(gaveUpText("naming", AIR)).toMatch(
      /^The hand did not finish: Naming the branch, see the hand's log/,
    );
  });

  it("shows the time the run has taken", () => {
    expect(elapsedText(0)).toBe("0:00");
    expect(elapsedText(45_900)).toBe("0:45");
    expect(elapsedText(187_000)).toBe("3:07");
  });
});
