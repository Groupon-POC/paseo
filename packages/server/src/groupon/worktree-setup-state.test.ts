// Added for Groupon Desk (fork of Paseo, Apache-2.0): the agent is told the worktree's setup still runs only while it runs, and an install or test waits for it.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createTestLogger } from "../test-utils/test-logger.js";
import { createProviderSnapshotManagerStub } from "../server/test-utils/session-stubs.js";
import { createAgentCommand } from "../server/agent/create-agent/create.js";
import type { ManagedAgent } from "../server/agent/agent-manager.js";
import {
  commandNeedsSetup,
  parseSetupState,
  readSetupStateFor,
  SETUP_POLL_MS,
  SETUP_STALE_MS,
  SETUP_WAIT_MS,
  type SetupState,
  setupNoticeFor,
  setupReadyLine,
  setupRunningNotice,
  setupStillRunning,
  setupWaitHook,
  sleepFor,
  waitForSetup,
  withPromptPreamble,
} from "./worktree-setup-state.js";

const T0 = Date.parse("2026-10-21T15:39:13.000Z");
const STEPS = ["pnpm install --frozen-lockfile", "pnpm checkout:prepare"];
const running: SetupState = {
  state: "running",
  step: "1/2 pnpm install --frozen-lockfile",
  steps: STEPS,
  startedAt: new Date(T0).toISOString(),
  finishedAt: null,
  error: null,
};
const ready: SetupState = {
  ...running,
  state: "ready",
  step: null,
  finishedAt: new Date(T0 + 175_000).toISOString(),
};
const failed: SetupState = {
  ...running,
  state: "failed",
  finishedAt: new Date(T0 + 95_000).toISOString(),
  error: "exit 1 at 1/2 (pnpm install --frozen-lockfile)",
};

/** An agent run that ends at once. */
async function* noRun() {}

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

/** A worktree on disk: `.git` as a file, as `git worktree add` leaves it, and the files given. */
function worktree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "desk-setup-"));
  folders.push(root);
  writeFileSync(join(root, ".git"), "gitdir: /elsewhere\n");
  mkdirSync(join(root, ".groupon"), { recursive: true });
  mkdirSync(join(root, "packages", "app"), { recursive: true });
  for (const [path, text] of Object.entries(files)) writeFileSync(join(root, path), text);
  return root;
}

describe("the state file", () => {
  test("reads the hand's shape and refuses anything else", () => {
    expect(parseSetupState(JSON.stringify(running))).toEqual(running);
    expect(parseSetupState("{")).toBeNull();
    expect(parseSetupState(JSON.stringify({ state: "maybe", startedAt: "x" }))).toBeNull();
  });

  test("running counts only while fresh, and the daemon's own setup stands in until the hand has written", () => {
    expect(
      setupStillRunning({
        file: running,
        daemonSetupRunning: false,
        deskRunsSetup: false,
        now: T0 + 60_000,
      }),
    ).toBe(true);
    expect(
      setupStillRunning({
        file: running,
        daemonSetupRunning: true,
        deskRunsSetup: true,
        now: T0 + SETUP_STALE_MS,
      }),
    ).toBe(false);
    expect(
      setupStillRunning({ file: ready, daemonSetupRunning: true, deskRunsSetup: true, now: T0 }),
    ).toBe(false);
    expect(
      setupStillRunning({ file: null, daemonSetupRunning: true, deskRunsSetup: true, now: T0 }),
    ).toBe(true);
    expect(
      setupStillRunning({ file: null, daemonSetupRunning: true, deskRunsSetup: false, now: T0 }),
    ).toBe(false);
    expect(
      setupStillRunning({ file: null, daemonSetupRunning: false, deskRunsSetup: true, now: T0 }),
    ).toBe(false);
  });

  test("the words name the steps, the file and the end", () => {
    expect(setupRunningNotice(running)).toBe(
      "The worktree's setup is still running (pnpm install --frozen-lockfile, then pnpm checkout:prepare). Read .groupon/setup-state.json and wait for state ready before installing, building or testing.",
    );
    expect(setupRunningNotice(null)).toContain("(pnpm install, then pnpm checkout:prepare)");
    expect(setupReadyLine(ready, 175)).toBe(
      "Worktree ready in 175 s: installing, building and testing are safe now.",
    );
    expect(setupReadyLine(failed, 95)).toContain(
      "failed after 95 s (exit 1 at 1/2 (pnpm install --frozen-lockfile))",
    );
  });
});

describe("the first prompt", () => {
  const desk = '[worktree]\nsetup = "groupon desk repo setup"\n';

  test("gets the line only while the setup runs, from a folder anywhere in the worktree", async () => {
    const live = worktree({ ".groupon/setup-state.json": JSON.stringify(running) });
    expect(await setupNoticeFor(join(live, "packages", "app"), false, T0 + 5_000)).toEqual({
      line: setupRunningNotice(running),
      root: live,
    });
    const done = worktree({
      ".groupon/setup-state.json": JSON.stringify(ready),
      ".groupon/desk.toml": desk,
    });
    expect(await setupNoticeFor(done, true, T0 + 5_000)).toBeNull();
    const notYetWritten = worktree({ ".groupon/desk.toml": desk });
    expect(await setupNoticeFor(notYetWritten, true, T0)).toMatchObject({ root: notYetWritten });
    expect(await setupNoticeFor(notYetWritten, false, T0)).toBeNull();
    const otherRepository = worktree({});
    expect(await setupNoticeFor(otherRepository, true, T0)).toBeNull();
  });

  test("leads the message the agent reads; the person's words stay the typed text", async () => {
    expect(withPromptPreamble("setup runs", "ahoj")).toEqual([
      { type: "text", mimeType: "text/plain", title: "Groupon Desk", text: "setup runs" },
      { type: "text", text: "ahoj" },
    ]);
    const snapshot = {
      id: "agent-1",
      provider: "claude",
      cwd: "/tmp/w",
      runtimeInfo: null,
    } as ManagedAgent;
    const streamAgent = vi.fn(() => noRun());
    const deps: Parameters<typeof createAgentCommand>[0] = {
      agentManager: {
        createAgent: vi.fn(async () => snapshot),
        getAgent: vi.fn(() => snapshot),
        tryRunOutOfBand: vi.fn(() => false),
        hasInFlightRun: vi.fn(() => false),
        streamAgent,
        waitForAgentRunStart: vi.fn(async () => undefined),
      } as unknown as Parameters<typeof createAgentCommand>[0]["agentManager"],
      agentStorage: {} as Parameters<typeof createAgentCommand>[0]["agentStorage"],
      logger: createTestLogger(),
      providerSnapshotManager: createProviderSnapshotManagerStub().manager,
    };
    const input = {
      kind: "session" as const,
      config: { provider: "claude", cwd: "/tmp/w" },
      workspaceId: "ws-1",
      initialPrompt: "ahoj",
      labels: {},
      provisionalTitle: null,
      firstAgentContext: { attachments: [] },
      buildSessionConfig: async (config: { provider: string; cwd: string }) => ({
        sessionConfig: config,
      }),
    };
    await createAgentCommand(deps, { ...input, promptPreamble: setupRunningNotice(running) });
    expect(streamAgent).toHaveBeenLastCalledWith(
      "agent-1",
      withPromptPreamble(setupRunningNotice(running), "ahoj"),
      expect.anything(),
    );
    await createAgentCommand(deps, input);
    expect(streamAgent).toHaveBeenLastCalledWith("agent-1", "ahoj", expect.anything());
  });
});

describe("a Bash call that needs the setup", () => {
  test("is any pnpm call that installs or runs something", () => {
    for (const command of [
      "pnpm install",
      "pnpm i",
      "pnpm test",
      "pnpm build",
      "pnpm validate",
      "pnpm checkout:prepare",
      "pnpm -C packages/groupon-cli test",
      "pnpm --filter @groupon2/lib run build",
      "cd packages/x && pnpm test -- tests/a.test.ts",
      // pnpm 11 installs before any script: the W116 agent's first command (ledger WW-105).
      "pnpm -s guards; date -u +%T",
      "pnpm guards",
      "pnpm run guards",
      "pnpm exec vitest run src/test",
      "pnpm --dir apps/x lint",
      "pnpm --filter=@groupon2/lib type-check",
      "date -u +%T; pnpm -s guards",
      "time pnpm check:ci",
      "CI=1 pnpm test",
      "git status && pnpm ls && pnpm gen",
      "if true; then pnpm guards; fi",
      "(cd apps/x && pnpm dev)",
    ])
      expect(commandNeedsSetup(command), command).toBe(true);
  });

  test("is never a pnpm call that only reads, nor anything but pnpm", () => {
    for (const command of [
      "git status",
      "pnpm",
      "pnpm --version",
      "pnpm -v",
      "pnpm ls --depth 0",
      "pnpm why vitest",
      "pnpm config get verify-deps-before-run",
      "pnpm -C packages/x list",
      "ls node_modules",
      "npm test",
      "cat pnpm-test.log",
      "cat pnpm-lock.yaml | head",
      'grep -rn "pnpm test" docs',
      "echo pnpm test",
      "rg pnpm-workspace",
    ])
      expect(commandNeedsSetup(command), command).toBe(false);
  });

  /** A clock that moves only when the wait sleeps, and a file read that answers in turn. */
  function fakes(answers: Array<SetupState | null>) {
    let now = T0;
    let reads = 0;
    const slept: number[] = [];
    return {
      slept,
      reads: () => reads,
      deps: {
        read: async () => answers[Math.min(reads++, answers.length - 1)] ?? null,
        now: () => now,
        sleep: async (ms: number) => {
          slept.push(ms);
          now += ms;
        },
      },
    };
  }

  test("waits while the setup runs, then runs once it is ready", async () => {
    const clock = fakes([running, running, running, ready]);
    expect(await waitForSetup(clock.deps)).toBe("ready");
    expect(clock.slept).toEqual([SETUP_POLL_MS, SETUP_POLL_MS, SETUP_POLL_MS]);
  });

  test("runs at once when nothing runs or the setup failed, and gives up after five minutes", async () => {
    expect(await waitForSetup(fakes([null]).deps)).toBe("not-running");
    expect(await waitForSetup(fakes([ready]).deps)).toBe("not-running");
    const failedClock = fakes([failed]);
    expect(await waitForSetup(failedClock.deps)).toBe("failed");
    expect(failedClock.slept).toEqual([]);
    const forever = fakes([running]);
    expect(await waitForSetup(forever.deps)).toBe("timed-out");
    expect(forever.slept.reduce((sum, ms) => sum + ms, 0)).toBe(SETUP_WAIT_MS);
  });

  test("the hook waits for a matching Bash call, says so, and leaves every other call alone", async () => {
    const clock = fakes([running, running, ready]);
    const log: string[] = [];
    const hook = setupWaitHook({
      readFor: clock.deps.read,
      now: clock.deps.now,
      sleep: clock.deps.sleep,
      log: (line) => log.push(line),
    });
    const signal = new AbortController().signal;
    expect(
      await hook({ tool_name: "Read", tool_input: { file_path: "x" }, cwd: "/w" }, "t1", {
        signal,
      }),
    ).toEqual({});
    expect(
      await hook({ tool_name: "Bash", tool_input: { command: "git status" }, cwd: "/w" }, "t2", {
        signal,
      }),
    ).toEqual({});
    expect(clock.reads()).toBe(0);
    expect(
      await hook({ tool_name: "Bash", tool_input: { command: "pnpm test" }, cwd: "/w" }, "t3", {
        signal,
      }),
    ).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext:
          "This command waited 4 s for the worktree's setup to finish; the worktree is ready.",
      },
    });
    expect(log).toEqual(['setup wait: "pnpm test" waited 4 s for the setup (/w)']);
  });

  test("the hook lets a call run at once after a failed setup, with a line in the hand's log", async () => {
    const clock = fakes([failed]);
    const log: string[] = [];
    const hook = setupWaitHook({
      readFor: clock.deps.read,
      now: clock.deps.now,
      sleep: clock.deps.sleep,
      log: (line) => log.push(line),
    });
    const result = await hook(
      { tool_name: "Bash", tool_input: { command: "pnpm install" }, cwd: "/w" },
      "t",
      { signal: new AbortController().signal },
    );
    expect(result).toEqual({});
    expect(clock.slept).toEqual([]);
    expect(log).toEqual([
      'setup wait: the worktree\'s setup failed, "pnpm install" runs at once (/w)',
    ]);
  });

  test("the hook stops waiting when the turn is stopped", async () => {
    const controller = new AbortController();
    const clock = fakes([running]);
    const hook = setupWaitHook({
      readFor: clock.deps.read,
      now: clock.deps.now,
      sleep: async (ms) => {
        await clock.deps.sleep(ms);
        controller.abort();
      },
      log: () => undefined,
    });
    expect(
      await hook({ tool_name: "Bash", tool_input: { command: "pnpm build" }, cwd: "/w" }, "t", {
        signal: controller.signal,
      }),
    ).toEqual({});
    expect(clock.slept).toEqual([SETUP_POLL_MS]);
  });
  test("a hub agent's first `pnpm -s guards` waits on the worktree's own file until it says ready", async () => {
    // Ledger WW-105: the agent the door made on the Mac mini ran this while the file said running.
    const startedAt = new Date().toISOString();
    const root = worktree({
      [".groupon/setup-state.json"]: JSON.stringify({ ...running, startedAt }),
    });
    const log: string[] = [];
    const hook = setupWaitHook(
      { readFor: readSetupStateFor, now: Date.now, sleep: sleepFor, log: (line) => log.push(line) },
      { pollMs: 10 },
    );
    const flip = setTimeout(
      () =>
        writeFileSync(
          join(root, ".groupon/setup-state.json"),
          JSON.stringify({ ...ready, startedAt, finishedAt: new Date().toISOString() }),
        ),
      80,
    );
    const before = Date.now();
    const result = await hook(
      {
        tool_name: "Bash",
        tool_input: { command: "pnpm -s guards; date -u +%T" },
        cwd: join(root, "packages", "app"),
      },
      "t",
      { signal: new AbortController().signal },
    );
    clearTimeout(flip);
    expect(Date.now() - before).toBeGreaterThanOrEqual(70);
    expect(result).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: expect.stringContaining("the worktree is ready"),
      },
    });
    expect(log).toEqual([
      expect.stringMatching(
        /^setup wait: "pnpm -s guards; date -u \+%T" waited \d+ s for the setup/,
      ),
    ]);
  });
});
