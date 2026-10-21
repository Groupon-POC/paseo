// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for the list of workspaces a release train archived.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createWorkspaceRecoveryService } from "../server/session/workspace-recovery/workspace-recovery-service.js";
import {
  createPersistedProjectRecord,
  type PersistedWorkspaceRecord,
} from "../server/workspace-registry.js";
import { createWorktree } from "../utils/worktree.js";
import {
  listTrainArchivedWorkspaces,
  pullRequestNumberOf,
  recordTrunkBranch,
} from "./train-archived.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirectories.push(dir);
  return dir;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  }).trim();
}

function record(overrides: Partial<PersistedWorkspaceRecord>): PersistedWorkspaceRecord {
  return {
    workspaceId: "wks_1",
    projectId: "p1",
    cwd: "/w/one",
    kind: "worktree",
    displayName: "one",
    title: null,
    branch: "ctzaruba/one",
    worktreeRoot: "/w/one",
    baseBranch: "refs/remotes/origin/staging",
    isPaseoOwnedWorktree: true,
    mainRepoRoot: "/repo",
    createdAt: "2026-10-19T08:00:00.000Z",
    updatedAt: "2026-10-19T08:00:00.000Z",
    archivedAt: "2026-10-19T09:00:00.000Z",
    autoArchivedChangeRequestUrl: "https://github.com/groupon2/engineering-development/pull/371",
    pinnedAt: null,
    background: false,
    ...overrides,
  } as PersistedWorkspaceRecord;
}

describe("workspaces archived by a release train", () => {
  test("pull request numbers out of their addresses", () => {
    expect(pullRequestNumberOf("https://github.com/o/r/pull/375")).toBe(375);
    expect(pullRequestNumberOf("https://gitlab.com/o/r/-/merge_requests/12")).toBe(12);
    expect(pullRequestNumberOf("https://github.com/o/r")).toBeNull();
  });

  test("lists the archives whose pull request's head was a trunk, asking each pull request once", async () => {
    const readPullRequestHead = vi.fn(async (_cwd: string, number: number) =>
      number === 371 ? "staging" : "ctzaruba/two",
    );
    const listed = await listTrainArchivedWorkspaces({
      listWorkspaces: async () => [
        record({ workspaceId: "wks_1" }),
        record({ workspaceId: "wks_2", archivedAt: "2026-10-19T10:00:00.000Z" }),
        record({
          workspaceId: "wks_3",
          autoArchivedChangeRequestUrl:
            "https://github.com/groupon2/engineering-development/pull/380",
        }),
        record({ workspaceId: "wks_4", autoArchivedChangeRequestUrl: null }),
        record({ workspaceId: "wks_5", archivedAt: null }),
      ],
      readPullRequestHead,
      directoryExists: () => true,
    });
    expect(listed.map((workspace) => workspace.workspaceId)).toEqual(["wks_2", "wks_1"]);
    expect(listed[0]?.pullRequestHead).toBe("staging");
    expect(readPullRequestHead).toHaveBeenCalledTimes(2);
  });

  test("a workspace on the trunk itself is listed without asking the forge", async () => {
    const readPullRequestHead = vi.fn(async () => "staging");
    const listed = await listTrainArchivedWorkspaces({
      listWorkspaces: async () => [record({ branch: "staging" })],
      readPullRequestHead,
      directoryExists: () => true,
    });
    expect(listed).toHaveLength(1);
    expect(readPullRequestHead).not.toHaveBeenCalled();
  });

  test("a pull request the forge cannot answer for is left out", async () => {
    const listed = await listTrainArchivedWorkspaces({
      listWorkspaces: async () => [record({})],
      readPullRequestHead: async () => {
        throw new Error("gh: not signed in");
      },
      directoryExists: () => true,
    });
    expect(listed).toEqual([]);
  });

  test("lists every archived workspace on a shared trunk even when its record kept no pull request (the daemons of 2026-10-20)", async () => {
    const readPullRequestHead = vi.fn(async () => "staging");
    // The shape measured on the owner's Mac, 2026-10-21: the main checkout on staging, archived
    // with no pull request address.
    const onStaging = record({
      workspaceId: "wks_staging_a",
      kind: "local_checkout",
      branch: "staging",
      baseBranch: null,
      mainRepoRoot: null,
      cwd: "/nowhere/engineering-development",
      worktreeRoot: "/nowhere/engineering-development",
      title: "Count skills in repository",
      archivedAt: "2026-10-20T11:35:28.584Z",
      autoArchivedChangeRequestUrl: null,
    });
    const onProduction = record({
      workspaceId: "wks_production",
      branch: "production",
      archivedAt: "2026-10-20T09:00:00.000Z",
      autoArchivedChangeRequestUrl: null,
    });
    const ownBranchNoUrl = record({
      workspaceId: "wks_own",
      branch: "ctzaruba/own",
      autoArchivedChangeRequestUrl: null,
    });
    const notArchived = record({
      workspaceId: "wks_live",
      branch: "staging",
      archivedAt: null,
      autoArchivedChangeRequestUrl: null,
    });
    const listed = await listTrainArchivedWorkspaces({
      listWorkspaces: async () => [onProduction, ownBranchNoUrl, onStaging, notArchived],
      readPullRequestHead,
      directoryExists: () => true,
    });
    expect(listed).toEqual([
      expect.objectContaining({
        workspaceId: "wks_staging_a",
        name: "Count skills in repository",
        branch: "staging",
        archivedAt: "2026-10-20T11:35:28.584Z",
        pullRequestUrl: null,
        pullRequestHead: "staging",
      }),
      expect.objectContaining({
        workspaceId: "wks_production",
        pullRequestUrl: null,
        pullRequestHead: "production",
      }),
    ]);
    expect(readPullRequestHead).not.toHaveBeenCalled();
  });

  test("lists both shapes together: a trunk record without an address, a branch record whose pull request's head was a trunk", async () => {
    const listed = await listTrainArchivedWorkspaces({
      listWorkspaces: async () => [
        record({
          workspaceId: "wks_branch",
          archivedAt: "2026-10-19T09:00:00.000Z",
        }),
        record({
          workspaceId: "wks_trunk",
          branch: "staging",
          archivedAt: "2026-10-20T11:00:00.000Z",
          autoArchivedChangeRequestUrl: null,
        }),
      ],
      readPullRequestHead: async () => "staging",
      directoryExists: () => true,
    });
    expect(listed.map((row) => [row.workspaceId, row.pullRequestUrl])).toEqual([
      ["wks_trunk", null],
      ["wks_branch", "https://github.com/groupon2/engineering-development/pull/371"],
    ]);
  });

  test("the repository's default branch (origin/HEAD) counts as a trunk", async () => {
    const repo = tempDir("train-archived-default-");
    mkdirSync(join(repo, ".git", "refs", "remotes", "origin"), {
      recursive: true,
    });
    writeFileSync(
      join(repo, ".git", "refs", "remotes", "origin", "HEAD"),
      "ref: refs/remotes/origin/trunk-of-this-repo\n",
    );
    const onDefault = record({
      kind: "local_checkout",
      branch: "trunk-of-this-repo",
      baseBranch: null,
      mainRepoRoot: null,
      cwd: repo,
      worktreeRoot: repo,
      autoArchivedChangeRequestUrl: null,
    });
    expect(recordTrunkBranch(onDefault)).toBe("trunk-of-this-repo");
    const listed = await listTrainArchivedWorkspaces({
      listWorkspaces: async () => [onDefault],
      readPullRequestHead: async () => "x",
    });
    expect(listed).toHaveLength(1);
    expect(recordTrunkBranch(record({ branch: "ctzaruba/one" }))).toBeNull();
  });
});

describe("restoring a workspace archived on a trunk", () => {
  test("recreates its removed worktree on a fresh branch cut from the trunk's current head at origin", async () => {
    const root = tempDir("train-archived-restore-");
    const origin = join(root, "origin.git");
    const repoDir = join(root, "repo");
    const other = join(root, "other");
    const paseoHome = join(root, "paseo-home");
    const worktreesRoot = join(root, "worktrees");
    execFileSync("git", ["init", "--bare", "-b", "main", origin], {
      stdio: "pipe",
    });
    mkdirSync(repoDir);
    git(repoDir, "init", "-b", "main");
    git(repoDir, "config", "user.email", "test@example.com");
    git(repoDir, "config", "user.name", "Desk Test");
    writeFileSync(join(repoDir, "README.md"), "initial\n");
    git(repoDir, "add", ".");
    git(repoDir, "-c", "commit.gpgsign=false", "commit", "-m", "initial");
    git(repoDir, "branch", "staging");
    git(repoDir, "remote", "add", "origin", origin);
    git(repoDir, "push", "origin", "main", "staging");

    const created = await createWorktree({
      cwd: repoDir,
      worktreeSlug: "on-staging",
      source: { kind: "checkout-branch", branchName: "staging" },
      runSetup: false,
      paseoHome,
      worktreesRoot,
    });
    expect(git(created.worktreePath, "rev-parse", "--abbrev-ref", "HEAD")).toBe("staging");
    git(repoDir, "worktree", "remove", "--force", created.worktreePath);
    expect(existsSync(created.worktreePath)).toBe(false);

    // The trunk moves on at origin after the archive; the local staging stays behind.
    execFileSync("git", ["clone", "-b", "staging", origin, other], {
      stdio: "pipe",
    });
    git(other, "config", "user.email", "test@example.com");
    git(other, "config", "user.name", "Desk Test");
    writeFileSync(join(other, "train.txt"), "landed\n");
    git(other, "add", ".");
    git(other, "-c", "commit.gpgsign=false", "commit", "-m", "a train landed");
    git(other, "push", "origin", "staging");
    const trunkHead = git(other, "rev-parse", "HEAD");
    // The main checkout now holds staging, as the owner's does.
    git(repoDir, "switch", "staging");

    const workspace = record({
      workspaceId: "wks_trunk_restore",
      projectId: "p1",
      kind: "worktree",
      branch: "staging",
      baseBranch: null,
      cwd: created.worktreePath,
      worktreeRoot: created.worktreePath,
      mainRepoRoot: repoDir,
      autoArchivedChangeRequestUrl: null,
    });
    const project = createPersistedProjectRecord({
      projectId: "p1",
      rootPath: repoDir,
      kind: "git",
      displayName: "repo",
      createdAt: "2026-10-19T08:00:00.000Z",
      updatedAt: "2026-10-19T08:00:00.000Z",
    });
    const unarchived: string[] = [];
    const service = createWorkspaceRecoveryService({
      paseoHome,
      worktreesRoot,
      getWorkspace: async (id) => (id === workspace.workspaceId ? workspace : null),
      getProject: async (id) => (id === project.projectId ? project : null),
      isDirectory: async (path) => existsSync(path) && statSync(path).isDirectory(),
      unarchiveWorkspace: async (row) => {
        unarchived.push(row.workspaceId);
      },
    });

    await expect(service.restore(workspace.workspaceId)).resolves.toEqual({
      workspaceId: workspace.workspaceId,
      action: "restore",
    });
    expect(existsSync(created.worktreePath)).toBe(true);
    expect(git(created.worktreePath, "rev-parse", "HEAD")).toBe(trunkHead);
    expect(git(created.worktreePath, "rev-parse", "--abbrev-ref", "HEAD")).toMatch(
      /^restored\/staging-[0-9a-f]{8}$/,
    );
    expect(unarchived).toEqual([workspace.workspaceId]);
  });
});
