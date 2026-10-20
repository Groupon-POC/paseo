// Added for Groupon Desk (fork of Paseo, Apache-2.0): the workspaces auto-archive-on-merge archived when a release train merged, for Settings to restore.

/**
 * Before the shared-trunk rule (`shared-trunk.ts`), auto-archive-on-merge archived a workspace
 * whenever the pull request matched to it merged, and a workspace could be matched to the release
 * train's pull request (head `staging`): every train that merged archived the owner's workspaces
 * (measured 2026-10-20). Each such archive record keeps the merged pull request's address
 * (`autoArchivedChangeRequestUrl`); this lists the records whose pull request's head was a shared
 * trunk, read from the record's own branch when that is a trunk, else asked of the forge once per
 * pull request. Restoring one is Paseo's own workspace recovery (`workspace.recovery.restore`).
 *
 * Constraints:
 * - Read only: never unarchives anything by itself.
 * - A pull request the forge cannot answer for is left out, never guessed into the list.
 */

import { existsSync } from "node:fs";
import type { PersistedWorkspaceRecord } from "../server/workspace-registry.js";
import { isSharedTrunkBranch, readDeskTargetBranch } from "./shared-trunk.js";

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
  pullRequestUrl: string;
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
    const url = record.autoArchivedChangeRequestUrl;
    if (!record.archivedAt || !url) continue;
    const trunks = [record.baseBranch, readDeskTargetBranch(record.mainRepoRoot)];
    let head: string | null = isSharedTrunkBranch(record.branch, trunks) ? record.branch : null;
    if (!head) {
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
