// Added for Groupon Desk (fork of Paseo, Apache-2.0): the setup notice reaches the first prompt of an agent made without an initial prompt, once.

import { describe, expect, test } from "vitest";
import { FirstPromptNotice, type FirstPromptAgent } from "./first-prompt-notice.js";
import { setupRunningNotice, type SetupState, withPromptPreamble } from "./worktree-setup-state.js";

const T0 = Date.parse("2026-10-22T09:00:00.000Z");
const fresh: FirstPromptAgent = { cwd: "/w/a/sub", workspaceId: "ws-1", lastUserMessageAt: null };

function running(startedAt = T0): SetupState {
  return {
    state: "running",
    step: "1/2 pnpm install",
    steps: ["pnpm install", "pnpm checkout:prepare"],
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: null,
    error: null,
  };
}

function make(options: { file: SetupState | null; daemon?: boolean; now?: number }) {
  let calls = 0;
  const notice = new FirstPromptNotice({
    notice: async (cwd, daemonRunning, now) => {
      calls += 1;
      expect(cwd).toBe(fresh.cwd);
      const file = options.file;
      if (!file) return daemonRunning ? { line: setupRunningNotice(null), root: "/w/a" } : null;
      const started = Date.parse(file.startedAt);
      const live = file.state === "running" && now - started < 30 * 60_000;
      return live ? { line: setupRunningNotice(file), root: "/w/a" } : null;
    },
    daemonSetupRunning: () => options.daemon ?? false,
    now: () => options.now ?? T0 + 10_000,
  });
  return { notice, calls: () => calls };
}

describe("FirstPromptNotice", () => {
  test("the first prompt of a fresh agent gets the notice while the setup runs", async () => {
    const { notice } = make({ file: running() });
    const got = await notice.preambleFor("agent-1", fresh);
    expect(got?.root).toBe("/w/a");
    expect(got?.line).toContain("still running");
    expect(got?.line).toContain("pnpm install, then pnpm checkout:prepare");
    // The way the prompt carries it: a text attachment in front of the person's words.
    const prompt = withPromptPreamble(got?.line ?? "", "run pnpm -s guards");
    expect(Array.isArray(prompt) && prompt[0]).toMatchObject({
      type: "text",
      mimeType: "text/plain",
    });
    expect(Array.isArray(prompt) && prompt[1]).toMatchObject({ text: "run pnpm -s guards" });
  });

  test("the second prompt gets nothing, even when the first turn has not yet recorded a user message", async () => {
    const { notice, calls } = make({ file: running() });
    expect(await notice.preambleFor("agent-1", fresh)).not.toBeNull();
    expect(await notice.preambleFor("agent-1", fresh)).toBeNull();
    expect(calls()).toBe(1);
  });

  test("an agent that already had a user message gets nothing", async () => {
    const { notice, calls } = make({ file: running() });
    const seasoned = { ...fresh, lastUserMessageAt: new Date(T0) };
    expect(await notice.preambleFor("agent-1", seasoned)).toBeNull();
    expect(calls()).toBe(0);
  });

  test("an agent created with an initial prompt gets nothing", async () => {
    const { notice, calls } = make({ file: running() });
    notice.markPrompted("agent-1", "start on the ticket");
    expect(await notice.preambleFor("agent-1", fresh)).toBeNull();
    expect(calls()).toBe(0);
  });

  test("an agent created without an initial prompt is not marked", async () => {
    const { notice } = make({ file: running() });
    notice.markPrompted("agent-1", undefined);
    notice.markPrompted("agent-1", "");
    expect(await notice.preambleFor("agent-1", fresh)).not.toBeNull();
  });

  test("a setup that is ready, stale, or absent gives no notice, and the agent is still served once", async () => {
    const ready = { ...running(), state: "ready" as const, finishedAt: new Date(T0).toISOString() };
    expect(await make({ file: ready }).notice.preambleFor("a", fresh)).toBeNull();
    const stale = make({ file: running(T0 - 31 * 60_000) });
    expect(await stale.notice.preambleFor("a", fresh)).toBeNull();
    expect(await make({ file: null }).notice.preambleFor("a", fresh)).toBeNull();
  });

  test("no file yet while the daemon's own setup runs gives the notice", async () => {
    const { notice } = make({ file: null, daemon: true });
    expect(await notice.preambleFor("agent-1", fresh)).toMatchObject({ root: "/w/a" });
  });

  test("an unknown agent and a failing read give no notice", async () => {
    const { notice } = make({ file: running() });
    expect(await notice.preambleFor("gone", null)).toBeNull();
    const broken = new FirstPromptNotice({
      notice: async () => {
        throw new Error("disk");
      },
      daemonSetupRunning: () => false,
      now: () => T0,
    });
    expect(await broken.preambleFor("agent-1", fresh)).toBeNull();
  });

  test("a prompt that never went out leaves the next first prompt its notice", async () => {
    const { notice } = make({ file: running() });
    expect(await notice.preambleFor("agent-1", fresh)).not.toBeNull();
    notice.release("agent-1");
    expect(await notice.preambleFor("agent-1", fresh)).not.toBeNull();
  });

  test("two agents are served independently", async () => {
    const { notice } = make({ file: running() });
    expect(await notice.preambleFor("agent-1", fresh)).not.toBeNull();
    expect(await notice.preambleFor("agent-2", fresh)).not.toBeNull();
  });
});
