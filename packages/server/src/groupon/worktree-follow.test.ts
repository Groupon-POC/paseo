// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for a chat following its turn into another worktree of its repository.

import { describe, expect, test } from "vitest";
import {
  claimTurnEvent,
  followedWorktreeOf,
  noteTurnStart,
  takeTurnStart,
  type WorktreeFollowDeps,
} from "./worktree-follow.js";

const CHECKOUT = "/Users/n/projects/groupon-monorepo";
const WORKTREE = `${CHECKOUT}/.claude/worktrees/ENC-10917`;
const OTHER_WORKTREE = `${CHECKOUT}/.claude/worktrees/ENC-10950`;
const OTHER_REPO = "/Users/n/projects/paseo";
const GONE = `${CHECKOUT}/.claude/worktrees/review-9845`;

// The worktree a folder lies in: the longest known root it starts with; a removed one is no repository.
const deps: WorktreeFollowDeps = {
  worktreeRootOf: async (dir) =>
    dir.startsWith(GONE)
      ? null
      : ([WORKTREE, OTHER_WORKTREE, OTHER_REPO, CHECKOUT].find(
          (root) => dir === root || dir.startsWith(`${root}/`),
        ) ?? null),
  mainRepoRoot: async (dir) => (dir.startsWith(OTHER_REPO) ? OTHER_REPO : CHECKOUT),
};
const noRepo: WorktreeFollowDeps = { ...deps, worktreeRootOf: async () => null };

const at = new Date("2026-10-28T11:51:49Z");
const edits = (...paths: string[]) => paths.map((path) => ({ path, at }));

describe("the worktree a chat's turn worked in", () => {
  test("is the one other worktree of its repository that holds every edit the turn made there", async () => {
    const turn = edits(
      `${WORKTREE}/apps/admin-react-fe/src/utils/version-check.ts`,
      `${WORKTREE}/.github/workflows/frontend-deploy-cloudrun.yml`,
      // Notes in another repository, or outside any, do not hold the chat back.
      `${OTHER_REPO}/GROUPON-FORK.md`,
      "/tmp/pr9845-summary.md",
    );

    expect(await followedWorktreeOf({ edits: turn, chatCwd: CHECKOUT }, deps)).toBe(WORKTREE);
  });

  test("is none for a turn that edited nothing, only its own worktree, or two worktrees", async () => {
    const own = edits(`${CHECKOUT}/apps/x.ts`);
    const split = edits(`${CHECKOUT}/apps/x.ts`, `${WORKTREE}/apps/y.ts`);
    const two = edits(`${WORKTREE}/apps/y.ts`, `${OTHER_WORKTREE}/apps/z.ts`);

    expect(await followedWorktreeOf({ edits: [], chatCwd: CHECKOUT }, deps)).toBeNull();
    expect(await followedWorktreeOf({ edits: own, chatCwd: CHECKOUT }, deps)).toBeNull();
    expect(await followedWorktreeOf({ edits: split, chatCwd: CHECKOUT }, deps)).toBeNull();
    expect(await followedWorktreeOf({ edits: two, chatCwd: CHECKOUT }, deps)).toBeNull();
  });

  test("is none for a worktree removed before the turn ended, or edits in another repository only", async () => {
    expect(
      await followedWorktreeOf({ edits: edits(`${GONE}/apps/y.ts`), chatCwd: CHECKOUT }, deps),
    ).toBeNull();
    expect(
      await followedWorktreeOf({ edits: edits(`${OTHER_REPO}/a.ts`), chatCwd: CHECKOUT }, deps),
    ).toBeNull();
    expect(
      await followedWorktreeOf({ edits: edits(`${WORKTREE}/a.ts`), chatCwd: "/tmp" }, noRepo),
    ).toBeNull();
  });

  test("follows a chat already in one worktree into the next", async () => {
    const turn = edits(`${OTHER_WORKTREE}/apps/z.ts`);

    expect(await followedWorktreeOf({ edits: turn, chatCwd: WORKTREE }, deps)).toBe(OTHER_WORKTREE);
  });
});

describe("one handling of a turn across the daemon's sessions", () => {
  test("the first session claims an event, the others do not", () => {
    const event = { type: "agent_stream" };

    expect(claimTurnEvent(event)).toBe(true);
    expect(claimTurnEvent(event)).toBe(false);
    expect(claimTurnEvent({ type: "agent_stream" })).toBe(true);
  });

  test("a turn's start is taken once", () => {
    noteTurnStart("agent-1", 1000);

    expect(takeTurnStart("agent-1")).toBe(1000);
    expect(takeTurnStart("agent-1")).toBeNull();
  });
});
