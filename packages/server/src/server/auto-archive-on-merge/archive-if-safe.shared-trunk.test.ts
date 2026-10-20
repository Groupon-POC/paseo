// Added for Groupon Desk (fork of Paseo, Apache-2.0): a release train merging never archives a workspace.

/**
 * Tests for auto-archive-on-merge against a pull request whose head is a shared trunk.
 *
 * Covers: src/server/auto-archive-on-merge/archive-if-safe.ts
 */

import type { Logger } from "pino";
import { describe, expect, test, vi } from "vitest";
import {
  archiveIfSafe,
  type ArchiveIfSafeDependencies,
  type AutoArchiveArchiveOptions,
} from "./archive-if-safe.js";
import type { WorkspaceGitRuntimeSnapshot } from "../workspace-git-service.js";

const CWD = "/tmp/paseo/worktrees/repo/branch";

function snapshot(currentBranch: string, headRefName: string): WorkspaceGitRuntimeSnapshot {
  return {
    cwd: CWD,
    git: {
      isGit: true,
      repoRoot: "/tmp/repo-without-desk-toml",
      mainRepoRoot: "/tmp/repo-without-desk-toml",
      currentBranch,
      remoteUrl: "https://github.com/groupon2/engineering-development.git",
      isPaseoOwnedWorktree: true,
      isDirty: false,
      baseRef: "staging",
      aheadBehind: { ahead: 0, behind: 0 },
      aheadOfOrigin: 0,
      behindOfOrigin: 0,
      hasRemote: true,
      diffStat: { additions: 0, deletions: 0 },
    },
    forge: {
      featuresEnabled: true,
      authState: "authenticated",
      pullRequest: {
        url: "https://github.com/groupon2/engineering-development/pull/372",
        title: "STG -> PRD",
        state: "merged",
        baseRefName: "production",
        headRefName,
        isMerged: true,
      },
      error: null,
    },
  };
}

async function run(current: string, head: string) {
  const archiveByScope = vi.fn(async () => ({
    archivedAgentIds: [],
    archivedWorkspaceIds: [],
    removedDirectory: false,
  }));
  const deps = {
    archiveByScope,
    isPaseoOwnedWorktreeCwd: vi.fn(async () => ({
      allowed: true,
      repoRoot: "/tmp/repo",
      worktreeRoot: "/tmp/paseo/worktrees/repo",
      worktreePath: CWD,
    })),
    killTerminalsForWorkspace: vi.fn(),
  } as unknown as ArchiveIfSafeDependencies;
  const options = {
    paseoHome: "/tmp/paseo",
    getAutoArchivedChangeRequestUrl: vi.fn(async () => null),
    archiveWorkspaceRecord: vi.fn(),
  } as unknown as AutoArchiveArchiveOptions;
  const log = { info: vi.fn(), warn: vi.fn() } as unknown as Logger;
  await archiveIfSafe({
    workspaceId: "ws-1",
    snapshot: snapshot(current, head),
    options,
    log,
    deps,
  });
  return archiveByScope;
}

describe("auto-archive-on-merge and shared trunks", () => {
  test("the release train (head staging) merging archives nothing", async () => {
    expect(await run("ctzaruba/hi", "staging")).not.toHaveBeenCalled();
  });

  test("a workspace on a trunk is never archived", async () => {
    expect(await run("staging", "staging")).not.toHaveBeenCalled();
  });

  test("a feature branch's own merged pull request still archives it", async () => {
    expect(await run("ctzaruba/fix-the-login", "ctzaruba/fix-the-login")).toHaveBeenCalledTimes(1);
  });
});
