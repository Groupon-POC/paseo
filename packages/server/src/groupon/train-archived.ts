// Added for Groupon Desk (fork of Paseo, Apache-2.0): the workspaces auto-archive-on-merge archived when a release train merged, for Settings to restore.

/**
 * Before the shared-trunk rule (`shared-trunk.ts`), auto-archive-on-merge archived a workspace
 * whenever the pull request matched to it merged, and a workspace could be matched to the release
 * train's pull request (head `staging`): every train that merged archived the owner's workspaces
 * (measured 2026-10-20). Two shapes of record come out of that:
 * - a workspace whose own branch is a shared trunk (`staging`, `production`, `main`, the
 *   repository's default branch, its base, desk.toml's target): listed whatever its record says
 *   of a pull request, since the daemons of 2026-10-20 archived such workspaces without keeping
 *   the address (`autoArchivedChangeRequestUrl` empty, measured 2026-10-21);
 * - a workspace on its own branch whose record keeps the merged pull request's address: listed
 *   when the forge says that pull request's head was a shared trunk, asked once per pull request.
 * Restoring one is Paseo's own workspace recovery (`workspace.recovery.restore`), which recreates
 * a trunk workspace's removed worktree from the trunk's current head.
 *
 * Constraints:
 * - Read only: never unarchives anything by itself.
 * - A pull request the forge cannot answer for is left out, never guessed into the list.
 */

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { PersistedWorkspaceRecord } from "../server/workspace-registry.js";
import { runGitCommand } from "../utils/run-git-command.js";
import type { WorktreeSource } from "../utils/worktree.js";
import {
  branchNameOf,
  isSharedTrunkBranch,
  readDeskTargetBranch,
  readOriginHeadBranch,
} from "./shared-trunk.js";

export const GROUPON_DESK_RPC_PLUGIN_ID = "groupon-desk";
export const GROUPON_DESK_RPC = {
  trainArchivedWorkspaces: "groupon-desk.train-archived-workspaces",
} as const;

export interface TrainArchivedWorkspace {
  workspaceId: string;
  projectId: string;
  name: string;
  branch: string | null;
  cwd: string;
  archivedAt: string;
  /** The merged pull request's address; null for a trunk workspace archived without one. */
  pullRequestUrl: string | null;
  /** The trunk it was archived on: the pull request's head, else the workspace's own branch. */
  pullRequestHead: string;
}

export interface TrainArchivedDeps {
  listWorkspaces: () => Promise<PersistedWorkspaceRecord[]>;
  /** The head branch of pull request `number` in the repository at `cwd`. */
  readPullRequestHead: (cwd: string, number: number) => Promise<string>;
  directoryExists?: (path: string) => boolean;
}

/** `https://github.com/o/r/pull/375` → 375; GitLab's `/-/merge_requests/12` → 12; else null. */
export function pullRequestNumberOf(url: string): number | null {
  const match = url.match(/\/(?:pull|pulls|merge_requests)\/(\d+)(?:[/?#]|$)/);
  return match ? Number(match[1]) : null;
}

/** The trunks of the record's repository beyond the fixed ones: its base, desk.toml's target, origin/HEAD. */
export function recordTrunks(record: PersistedWorkspaceRecord): string[] {
  const repoRoot = record.mainRepoRoot ?? record.worktreeRoot ?? record.cwd;
  return [
    record.baseBranch,
    readDeskTargetBranch(repoRoot),
    readOriginHeadBranch(join(repoRoot, ".git")),
  ].filter((trunk): trunk is string => Boolean(trunk));
}

function nameOf(record: PersistedWorkspaceRecord): string {
  return record.title?.trim() || record.displayName || record.branch || record.cwd;
}

export async function listTrainArchivedWorkspaces(
  deps: TrainArchivedDeps,
): Promise<TrainArchivedWorkspace[]> {
  const directoryExists = deps.directoryExists ?? existsSync;
  const headByUrl = new Map<string, Promise<string | null>>();
  const found: TrainArchivedWorkspace[] = [];
  for (const record of await deps.listWorkspaces()) {
    if (!record.archivedAt) continue;
    const url = record.autoArchivedChangeRequestUrl ?? null;
    const trunks = recordTrunks(record);
    let head = isSharedTrunkBranch(record.branch, trunks) ? branchNameOf(record.branch) : null;
    if (!head) {
      if (!url) continue;
      const number = pullRequestNumberOf(url);
      const askAt = [record.mainRepoRoot, record.worktreeRoot, record.cwd].find(
        (path): path is string => Boolean(path) && directoryExists(path as string),
      );
      if (number === null || !askAt) continue;
      let lookup = headByUrl.get(url);
      if (!lookup) {
        lookup = deps.readPullRequestHead(askAt, number).catch(() => null);
        headByUrl.set(url, lookup);
      }
      head = await lookup;
    }
    if (!head || !isSharedTrunkBranch(head, trunks)) continue;
    found.push({
      workspaceId: record.workspaceId,
      projectId: record.projectId,
      name: nameOf(record),
      branch: record.branch,
      cwd: record.cwd,
      archivedAt: record.archivedAt,
      pullRequestUrl: url,
      pullRequestHead: head,
    });
  }
  return found.sort((left, right) => right.archivedAt.localeCompare(left.archivedAt));
}

/** The trunk the record's own branch is, or null when it sits on a branch of its own. */
export function recordTrunkBranch(record: PersistedWorkspaceRecord): string | null {
  return isSharedTrunkBranch(record.branch, recordTrunks(record))
    ? branchNameOf(record.branch)
    : null;
}

const TRUNK_FETCH_TIMEOUT_MS = 30_000;

async function refVerifies(repoRoot: string, ref: string): Promise<boolean> {
  try {
    await runGitCommand(["rev-parse", "--verify", `${ref}^{commit}`], {
      cwd: repoRoot,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * How Restore recreates the removed worktree of a workspace whose own branch is a trunk: a fresh
 * branch `restored/<trunk>-<id>` cut from the trunk's current head (origin's, fetched first, else
 * the local branch). Checking the trunk itself out again would fail wherever the main checkout
 * holds it, and would bring back a stale local copy. Null for a workspace on its own branch,
 * which Paseo restores from that branch.
 */
export async function trunkRestoreSource(
  record: PersistedWorkspaceRecord,
  repoRoot: string,
): Promise<Extract<WorktreeSource, { kind: "restore-from-base" }> | null> {
  const trunk = recordTrunkBranch(record);
  if (!trunk) return null;
  const remoteRef = `refs/remotes/origin/${trunk}`;
  try {
    await runGitCommand(["fetch", "origin", `+refs/heads/${trunk}:${remoteRef}`], {
      cwd: repoRoot,
      envOverlay: { GIT_TERMINAL_PROMPT: "0" },
      timeout: TRUNK_FETCH_TIMEOUT_MS,
      acceptExitCodes: [0, 1, 128],
    });
  } catch {
    // Offline or timed out: cut from the last fetched head, else the local trunk.
  }
  let baseRef: string | null = null;
  for (const candidate of [remoteRef, `refs/heads/${trunk}`]) {
    if (await refVerifies(repoRoot, candidate)) {
      baseRef = candidate;
      break;
    }
  }
  if (!baseRef) {
    throw new Error(
      `The trunk ${trunk} is not in ${repoRoot}, so the worktree cannot be recreated.`,
    );
  }
  return {
    kind: "restore-from-base",
    baseRef,
    branchName: `restored/${trunk}-${randomUUID().slice(0, 8)}`,
  };
}
