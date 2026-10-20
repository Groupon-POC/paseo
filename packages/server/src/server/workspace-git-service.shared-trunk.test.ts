// Added for Groupon Desk (fork of Paseo, Apache-2.0): a workspace on a shared trunk shows no pull request.

/**
 * Tests for the workspace git service with the daemon's shared-trunk rule.
 *
 * Covers: src/server/workspace-git-service.ts (loadForgeSnapshot, the PR status poll target)
 */

import { join } from "node:path";
import type pino from "pino";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { isWorkspaceOnSharedTrunk } from "../groupon/shared-trunk.js";
import type { ForgeService } from "../services/forge-service.js";
import type {
  CheckoutSnapshotFacts,
  CheckoutStatusGit,
  PullRequestStatusResult,
} from "../utils/checkout-git.js";
import { WorkspaceGitServiceImpl } from "./workspace-git-service.js";

const REPO_CWD = "/tmp/groupon-trunk-repo";

function facts(branch: string, headRef = branch): CheckoutSnapshotFacts {
  return {
    isGit: true,
    worktreeRoot: REPO_CWD,
    currentBranch: branch,
    remoteUrl: "https://github.com/groupon2/engineering-development.git",
    absoluteGitDir: join(REPO_CWD, ".git"),
    gitCommonDir: join(REPO_CWD, ".git"),
    paseoWorktree: { isPaseoOwnedWorktree: false },
    storedBaseRef: null,
    resolvedBaseRef: "staging",
    mainRepoRoot: null,
    comparisonBaseRef: null,
    branchRemoteName: "origin",
    branchMergeRef: `refs/heads/${headRef}`,
    upstreamStatus: null,
    pullRequestLookupTarget: { headRef },
  };
}

function checkoutStatus(branch: string): CheckoutStatusGit {
  return {
    isGit: true,
    repoRoot: REPO_CWD,
    mainRepoRoot: null,
    currentBranch: branch,
    isDirty: false,
    baseRef: "staging",
    aheadBehind: { ahead: 0, behind: 0 },
    aheadOfOrigin: 0,
    behindOfOrigin: 0,
    hasRemote: true,
    remoteUrl: "https://github.com/groupon2/engineering-development.git",
    isPaseoOwnedWorktree: false,
  };
}

function pullRequest(headRefName: string, number: number): PullRequestStatusResult {
  return {
    status: {
      number,
      url: `https://github.com/groupon2/engineering-development/pull/${number}`,
      title: headRefName === "staging" ? "STG -> PRD" : "Fix the login",
      state: "open",
      baseRefName: headRefName === "staging" ? "production" : "staging",
      headRefName,
      isMerged: false,
      checksStatus: "failure",
    },
    authState: "authenticated",
    featuresEnabled: true,
    githubFeaturesEnabled: true,
  };
}

function forge(): ForgeService {
  return {
    getCurrentPullRequestStatus: vi.fn(async () => null),
    isAuthenticated: vi.fn(async () => true),
    authProbeCanThrow: true,
    invalidate: vi.fn(),
  } as unknown as ForgeService;
}

function createService(branch: string, headRef: string, status: PullRequestStatusResult) {
  const getPullRequestStatus = vi.fn(async () => status);
  const service = new WorkspaceGitServiceImpl({
    logger: { child: () => ({}), debug: vi.fn(), warn: vi.fn() } as unknown as pino.Logger,
    paseoHome: "/tmp/paseo-test",
    deps: {
      subscribe: vi.fn(async () => ({
        updateIgnore: vi.fn(async () => {}),
        unsubscribe: vi.fn(async () => {}),
      })),
      getCheckoutSnapshotFacts: vi.fn(async () => facts(branch, headRef)),
      getCheckoutStatus: vi.fn(async () => checkoutStatus(branch)),
      getCheckoutShortstat: vi.fn(async () => ({ additions: 0, deletions: 0 })),
      getPullRequestStatus,
      forgeOverrides: { github: forge() },
      resolveAbsoluteGitDir: vi.fn(async () => join(REPO_CWD, ".git")),
      hasOriginRemote: vi.fn(async () => true),
      isOnSharedTrunk: isWorkspaceOnSharedTrunk,
      now: () => new Date("2026-10-20T08:00:00.000Z"),
    },
  });
  return { service, getPullRequestStatus };
}

describe("a workspace on a shared trunk", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("the release train's pull request (head staging) is ignored on staging", async () => {
    const { service, getPullRequestStatus } = createService(
      "staging",
      "staging",
      pullRequest("staging", 375),
    );
    const snapshot = await service.getSnapshot(REPO_CWD, { force: true, reason: "test" });
    expect(snapshot.forge.pullRequest).toBeNull();
    expect(snapshot.forge.authState).toBe("authenticated");
    expect(getPullRequestStatus).not.toHaveBeenCalled();
    service.dispose();
  });

  test("a feature branch whose lookup lands on staging is matched to no pull request", async () => {
    const { service } = createService("ctzaruba/hi", "staging", pullRequest("staging", 375));
    const snapshot = await service.getSnapshot(REPO_CWD, { force: true, reason: "test" });
    expect(snapshot.forge.pullRequest).toBeNull();
    service.dispose();
  });

  test("a feature branch's own pull request still shows", async () => {
    const { service, getPullRequestStatus } = createService(
      "ctzaruba/fix-the-login",
      "ctzaruba/fix-the-login",
      pullRequest("ctzaruba/fix-the-login", 380),
    );
    const snapshot = await service.getSnapshot(REPO_CWD, { force: true, reason: "test" });
    expect(snapshot.forge.pullRequest?.number).toBe(380);
    expect(snapshot.forge.pullRequest?.checksStatus).toBe("failure");
    expect(getPullRequestStatus).toHaveBeenCalledTimes(1);
    service.dispose();
  });
});
