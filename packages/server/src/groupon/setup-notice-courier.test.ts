// Added for Groupon Desk (fork of Paseo, Apache-2.0): an agent told the setup still runs is told when it ends, in its running turn or at its next one, never woken for it.

import { describe, expect, test } from "vitest";
import { type DaemonSetupStatus, SetupNoticeCourier } from "./setup-notice-courier.js";
import { SETUP_POLL_MS, SETUP_STALE_MS, type SetupState } from "./worktree-setup-state.js";

const T0 = Date.parse("2026-10-21T15:39:13.000Z");
const running: SetupState = {
  state: "running",
  step: "1/2 pnpm install --frozen-lockfile",
  steps: ["pnpm install --frozen-lockfile", "pnpm checkout:prepare"],
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

function harness(options: {
  files: Array<SetupState | null>;
  steers: boolean[];
  daemon?: () => DaemonSetupStatus;
  read?: () => SetupState | null;
}) {
  let now = T0 + 5_000;
  let reads = 0;
  let steerCalls = 0;
  const steered: string[] = [];
  const log: string[] = [];
  let turnStarted: ((agentId: string) => void) | null = null;
  const courier = new SetupNoticeCourier({
    read: async () =>
      options.read?.() ?? options.files[Math.min(reads++, options.files.length - 1)] ?? null,
    daemonSetupStatus: () => options.daemon?.() ?? null,
    steer: async (agentId, line) => {
      const taken = options.steers[Math.min(steerCalls++, options.steers.length - 1)] ?? false;
      if (taken) steered.push(`${agentId}: ${line}`);
      return taken;
    },
    onTurnStarted: (listener) => {
      turnStarted = listener;
      return () => {
        turnStarted = null;
      };
    },
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
    log: (line) => log.push(line),
  });
  return {
    courier,
    steered,
    log,
    steerCalls: () => steerCalls,
    startTurn: async (agentId: string) => {
      turnStarted?.(agentId);
      await new Promise((done) => setTimeout(done, 0));
    },
    listening: () => turnStarted !== null,
  };
}

const watch = { agentId: "agent-1", workspaceId: "ws-1", root: "/wt" };

describe("the end of the setup", () => {
  test("goes into the agent's running turn as one line with the setup's own time", async () => {
    const h = harness({ files: [running, running, ready], steers: [true] });
    await h.courier.watch(watch);
    expect(h.steered).toEqual([
      "agent-1: Worktree ready in 175 s: installing, building and testing are safe now.",
    ]);
    expect(h.listening()).toBe(false);
  });

  test("waits for an idle agent's next turn instead of starting one", async () => {
    const h = harness({ files: [ready], steers: [false, true] });
    await h.courier.watch(watch);
    expect(h.steered).toEqual([]);
    expect(h.steerCalls()).toBe(1);
    expect(h.listening()).toBe(true);
    await h.startTurn("agent-2");
    expect(h.steerCalls()).toBe(1);
    await h.startTurn("agent-1");
    expect(h.steered).toEqual([
      "agent-1: Worktree ready in 175 s: installing, building and testing are safe now.",
    ]);
    expect(h.listening()).toBe(false);
  });

  test("follows the daemon's own setup when the hand wrote no file", async () => {
    const statuses: DaemonSetupStatus[] = ["running", "running", "completed"];
    let calls = 0;
    const h = harness({
      files: [null],
      steers: [true],
      daemon: () => statuses[Math.min(calls++, statuses.length - 1)] ?? null,
    });
    await h.courier.watch(watch);
    expect(h.steered).toEqual([
      `agent-1: Worktree ready in ${(2 * SETUP_POLL_MS) / 1000} s: installing, building and testing are safe now.`,
    ]);
  });

  test("lets a setup go that never ends, telling the agent nothing", async () => {
    // A running state renewed on every read: the setup never ends within the watch.
    const h = harness({
      files: [],
      steers: [true],
      read: () => ({ ...running, startedAt: new Date(Date.now()).toISOString() }),
    });
    await h.courier.watch(watch);
    expect(h.steerCalls()).toBe(0);
    expect(h.log.at(-1)).toBe(
      `setup notice: ws-1 still not ready after ${SETUP_STALE_MS / 60_000} min, agent agent-1 not told`,
    );
  });
});
