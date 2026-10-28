// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for a chat's move into a worktree of its own repository.

import { describe, expect, test } from "vitest";
import {
  type ChatRelocationDeps,
  scheduleChatRelocation,
  relocationCandidatesOf,
} from "./chat-relocation.js";

const CHECKOUT = "/Users/n/projects/groupon-monorepo";
const WORKTREE = `${CHECKOUT}/.claude/worktrees/ENC-10950`;
const OTHER_REPO = "/Users/n/projects/paseo";

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function world(overrides: Partial<ChatRelocationDeps> = {}) {
  const turn = deferred();
  const relocated: { agentId: string; cwd: string; workspaceId: string }[] = [];
  const failures: unknown[] = [];
  const workspaces: string[] = [];
  const deps: ChatRelocationDeps = {
    getChat: async (id) => (id === "agent-1" ? { cwd: CHECKOUT, hasSession: true } : null),
    realpath: async (path) => ([CHECKOUT, WORKTREE, OTHER_REPO].includes(path) ? path : null),
    mainRepoRoot: async (cwd) => (cwd.startsWith(OTHER_REPO) ? OTHER_REPO : CHECKOUT),
    workspaceFor: async (cwd) => {
      workspaces.push(cwd);
      return { workspaceId: "ws-worktree" };
    },
    waitForTurnEnd: () => turn.promise,
    relocate: async (agentId, cwd, workspaceId) => {
      relocated.push({ agentId, cwd, workspaceId });
    },
    onFailure: (_agentId, error) => failures.push(error),
    ...overrides,
  };
  return { deps, turn, relocated, failures, workspaces };
}

const settle = () => new Promise((done) => setTimeout(done, 0));

describe("a chat's move into a worktree of its repository", () => {
  test("answers the worktree's workspace at once and moves the chat only when its turn ends", async () => {
    const w = world();

    const answer = await scheduleChatRelocation({ agentId: "agent-1", path: WORKTREE }, w.deps);
    await settle();

    expect(answer).toEqual({ workspaceId: "ws-worktree", cwd: WORKTREE });
    expect(w.workspaces).toEqual([WORKTREE]);
    expect(w.relocated).toEqual([]);

    w.turn.resolve();
    await settle();

    expect(w.relocated).toEqual([
      { agentId: "agent-1", cwd: WORKTREE, workspaceId: "ws-worktree" },
    ]);
  });

  test.each([
    { path: "worktrees/ENC-10950", error: "The worktree's path must be absolute" },
    { path: "/nowhere", error: "No folder at /nowhere" },
    { path: CHECKOUT, error: `The chat already runs in ${CHECKOUT}` },
    {
      path: OTHER_REPO,
      error: `${OTHER_REPO} is not a worktree of the chat's repository (${CHECKOUT}): start a new chat there instead`,
    },
  ])("refuses $path before it makes anything", async ({ path, error }) => {
    const w = world();

    await expect(scheduleChatRelocation({ agentId: "agent-1", path }, w.deps)).rejects.toThrow(
      error,
    );

    expect(w.workspaces).toEqual([]);
  });

  test("refuses a chat it does not know, and one with no session to continue", async () => {
    const fresh = world({ getChat: async () => ({ cwd: CHECKOUT, hasSession: false }) });

    await expect(
      scheduleChatRelocation({ agentId: "agent-9", path: WORKTREE }, world().deps),
    ).rejects.toThrow("Agent not found: agent-9");
    await expect(
      scheduleChatRelocation({ agentId: "agent-1", path: WORKTREE }, fresh.deps),
    ).rejects.toThrow("The chat has no session to continue yet");
  });

  test("moves a chat once when it is asked twice before its turn ends (desk_move and the follow of its edits)", async () => {
    const w = world();

    const first = await scheduleChatRelocation({ agentId: "agent-1", path: WORKTREE }, w.deps);
    const second = await scheduleChatRelocation({ agentId: "agent-1", path: WORKTREE }, w.deps);
    w.turn.resolve();
    await settle();

    expect(second).toEqual(first);
    expect(w.workspaces).toEqual([WORKTREE]);
    expect(w.relocated).toHaveLength(1);
  });

  test("reports a move that fails after the turn, instead of losing it", async () => {
    const boom = new Error("resume failed");
    const w = world({
      relocate: async () => {
        throw boom;
      },
    });

    await scheduleChatRelocation({ agentId: "agent-1", path: WORKTREE }, w.deps);
    w.turn.resolve();
    await settle();

    expect(w.failures).toEqual([boom]);
  });
});

describe("the workspaces a moved chat may take", () => {
  const row = (workspaceId: string, projectId: string, cwd: string, archivedAt: string | null) => ({
    workspaceId,
    projectId,
    cwd,
    archivedAt,
    background: false,
  });

  test("are the chat's own project's active ones on the folder, never a project of the worktree's own", () => {
    const workspaces = [
      row("ws-stray", "proj-worktree", WORKTREE, null),
      row("ws-old", "proj-monorepo", WORKTREE, "2026-10-27T10:00:00Z"),
      row("ws-live", "proj-monorepo", WORKTREE, null),
      row("ws-checkout", "proj-monorepo", CHECKOUT, null),
    ];

    expect(
      relocationCandidatesOf(workspaces, "proj-monorepo", WORKTREE).map((w) => w.workspaceId),
    ).toEqual(["ws-live"]);
    expect(relocationCandidatesOf(workspaces.slice(0, 2), "proj-monorepo", WORKTREE)).toEqual([]);
  });
});
