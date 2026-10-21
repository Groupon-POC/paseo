// Added for Groupon Desk (fork of Paseo, Apache-2.0): the worktree's setup as one line above the composer.
import { describe, expect, it } from "vitest";
import {
  parseSetupMarkers,
  READY_VISIBLE_MS,
  type SetupSnapshotLike,
  worktreeSetupLine,
} from "./worktree-setup-line-model";

const START = Date.parse("2026-10-21T15:39:13.000Z");
const STEP1 = "[desk setup 1/2] pnpm install --frozen-lockfile (started 2026-10-21T15:39:13.000Z)";
const STEP2 = "[desk setup 2/2] pnpm checkout:prepare (started 2026-10-21T15:40:52.000Z)";

const EXIT_CODES: Record<SetupSnapshotLike["status"], number | null> = {
  running: null,
  completed: 0,
  failed: 1,
  blocked: 0,
};

function snapshot(
  status: SetupSnapshotLike["status"],
  log: string,
  command: Partial<SetupSnapshotLike["detail"]["commands"][number]> = {},
  updatedAt = START,
): SetupSnapshotLike {
  return {
    status,
    updatedAt,
    detail: {
      commands: [
        {
          command: "groupon desk repo setup",
          log,
          status: status === "blocked" ? "completed" : status,
          exitCode: EXIT_CODES[status],
          ...command,
        },
      ],
    },
  };
}

describe("parseSetupMarkers", () => {
  it("takes the last step, the first step's start and the end", () => {
    const markers = parseSetupMarkers(
      `${STEP1}\nProgress: resolved 1\n\u001b[32m${STEP2}\u001b[0m\r\n[desk setup] ready in 175 s\n`,
    );
    expect(markers.step).toEqual({
      index: 2,
      total: 2,
      command: "pnpm checkout:prepare",
      startedAt: Date.parse("2026-10-21T15:40:52.000Z"),
    });
    expect(markers.startedAt).toBe(START);
    expect(markers.finished).toEqual({ ok: true, seconds: 175 });
  });

  it("reads a failure and a log without markers", () => {
    expect(
      parseSetupMarkers(`${STEP1}\n[desk setup] failed at 1/2 with exit 1 after 12 s`).finished,
    ).toEqual({ ok: false, seconds: 12 });
    expect(parseSetupMarkers("Lockfile is up to date\nDone in 2s")).toEqual({
      step: null,
      startedAt: null,
      finished: null,
    });
  });
});

describe("worktreeSetupLine", () => {
  it("names the running step, its place and the time since the setup began", () => {
    expect(worktreeSetupLine(snapshot("running", STEP1), START + 45_000)).toEqual({
      tone: "running",
      text: "Preparing the worktree (1/2): pnpm install --frozen-lockfile, 45 s. The agent can already work.",
    });
    expect(worktreeSetupLine(snapshot("running", `${STEP1}\n${STEP2}`), START + 125_000)).toEqual({
      tone: "running",
      text: "Preparing the worktree (2/2): pnpm checkout:prepare, 2 min 05 s. The agent can already work.",
    });
  });

  it("names the setup command when the log has no marker", () => {
    expect(worktreeSetupLine(snapshot("running", "Resolving..."), START)?.text).toBe(
      "Preparing the worktree: groupon desk repo setup. The agent can already work.",
    );
  });

  it("says ready with the setup's time, then goes", () => {
    const done = snapshot(
      "completed",
      `${STEP1}\n${STEP2}\n[desk setup] ready in 175 s`,
      {},
      START,
    );
    expect(worktreeSetupLine(done, START + 1_000)).toEqual({
      tone: "ready",
      text: "Worktree ready in 2 min 55 s",
    });
    expect(worktreeSetupLine(done, START + READY_VISIBLE_MS + 1)).toBeNull();
    const unmarked = snapshot("completed", "ok", { durationMs: 4_200 }, START);
    expect(worktreeSetupLine(unmarked, START)?.text).toBe("Worktree ready in 4 s");
  });

  it("names the failed step and stays", () => {
    const failed = snapshot(
      "failed",
      `${STEP1}\n${STEP2}\n[desk setup] failed at 2/2 with exit 1 after 95 s`,
    );
    expect(worktreeSetupLine(failed, START + 10 * READY_VISIBLE_MS)).toEqual({
      tone: "failed",
      text: "Worktree setup failed at pnpm checkout:prepare (exit 1). Setup has the log.",
    });
  });

  it("says nothing without a setup, for a blocked one, or with no commands", () => {
    expect(worktreeSetupLine(null, START)).toBeNull();
    expect(worktreeSetupLine(snapshot("blocked", ""), START)).toBeNull();
    expect(
      worktreeSetupLine({ status: "running", updatedAt: START, detail: { commands: [] } }, START),
    ).toBeNull();
  });
});
