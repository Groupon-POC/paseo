// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for where a ticketless workspace is placed.

import { describe, expect, test, vi } from "vitest";
import type { CheckoutSnapshotFacts } from "../utils/checkout-git.js";
import {
  placeTicketlessWorkspace,
  type WorkspaceCreateRequest,
  type WorkspacePlacementDeps,
} from "./workspace-placement.js";

const REPO = "/tmp/groupon-placement-repo";

function facts(currentBranch: string): CheckoutSnapshotFacts {
  return {
    isGit: true,
    worktreeRoot: REPO,
    currentBranch,
    remoteUrl: "https://github.com/groupon2/engineering-development.git",
    absoluteGitDir: `${REPO}/.git`,
    gitCommonDir: `${REPO}/.git`,
    paseoWorktree: { isPaseoOwnedWorktree: false },
    storedBaseRef: null,
    resolvedBaseRef: "staging",
    mainRepoRoot: REPO,
    comparisonBaseRef: null,
    branchRemoteName: "origin",
    branchMergeRef: `refs/heads/${currentBranch}`,
    upstreamStatus: null,
    pullRequestLookupTarget: { headRef: currentBranch },
  };
}

function deps(currentBranch: string): WorkspacePlacementDeps & {
  nameBranch: ReturnType<typeof vi.fn>;
} {
  return {
    readFacts: vi.fn(async () => facts(currentBranch)),
    resolveWorktreeSourceCwd: vi.fn(async (source) => source.cwd ?? REPO),
    nameBranch: vi.fn(async (input) => ({
      branchName: input.prompt ? "ctzaruba/hi" : `ctzaruba/${input.fallbackSlug}`,
      fromPrompt: Boolean(input.prompt),
    })),
    createSlug: () => "brave-otter",
  };
}

function request(
  source: WorkspaceCreateRequest["source"],
  extra: Partial<WorkspaceCreateRequest> = {},
): WorkspaceCreateRequest {
  return {
    type: "workspace.create.request",
    requestId: "r1",
    source,
    firstAgentContext: { prompt: "hi", attachments: [] },
    ...extra,
  } as WorkspaceCreateRequest;
}

describe("a workspace started without a ticket", () => {
  test("Local on staging becomes a worktree on its own branch, cut from staging", async () => {
    const placement = await placeTicketlessWorkspace(
      request({ kind: "directory", path: REPO, projectId: "p1" }),
      deps("staging"),
    );
    expect(placement.request.source).toEqual({
      kind: "worktree",
      cwd: REPO,
      projectId: "p1",
      refName: "staging",
      worktreeSlug: "brave-otter",
      branchName: "ctzaruba/hi",
    });
    expect(placement.keepBranchName).toBe(true);
  });

  test("Local on the person's own branch stays Local", async () => {
    const original = request({ kind: "directory", path: REPO });
    const placement = await placeTicketlessWorkspace(original, deps("ctzaruba/fix-the-login"));
    expect(placement.request).toBe(original);
  });

  test("a worktree without a branch name gets `<login>/<slug>`", async () => {
    const placement = await placeTicketlessWorkspace(
      request({ kind: "worktree", cwd: REPO, worktreeSlug: "jolly-penguin", refName: "staging" }),
      deps("staging"),
    );
    expect(placement.request.source).toMatchObject({
      kind: "worktree",
      worktreeSlug: "jolly-penguin",
      branchName: "ctzaruba/hi",
    });
  });

  test("a worktree started empty is named after the worktree and renamed at its first message", async () => {
    const placement = await placeTicketlessWorkspace(
      request(
        { kind: "worktree", cwd: REPO, worktreeSlug: "jolly-penguin" },
        { firstAgentContext: undefined },
      ),
      deps("staging"),
    );
    expect(placement.request.source).toMatchObject({ branchName: "ctzaruba/jolly-penguin" });
    expect(placement.keepBranchName).toBe(false);
  });

  test("a ticket's branch, a checkout, an agent's request are left alone", async () => {
    const d = deps("staging");
    for (const original of [
      request({ kind: "worktree", cwd: REPO, branchName: "pe/ENC-1/ENC-2-fix" }),
      request({ kind: "worktree", cwd: REPO, action: "checkout", refName: "ctzaruba/x" }),
      request({ kind: "directory", path: REPO }, { callerAgentId: "agent-1" }),
    ]) {
      expect((await placeTicketlessWorkspace(original, d)).request).toBe(original);
    }
    expect(d.nameBranch).not.toHaveBeenCalled();
  });
});
