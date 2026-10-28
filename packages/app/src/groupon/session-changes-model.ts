// Added for Groupon Desk (fork of Paseo, Apache-2.0): what a workspace's sessions changed, as the Changes views read it.

/**
 * The daemon's answer to `groupon-desk.session.changes` (server `groupon/session-changes.ts`): per
 * git repository the session edited, the diff from where HEAD was at its first edit there. The
 * Changes views read it as one list of files, each path under its repository's name when the
 * session worked in more than one, so the file tree groups them by repository by itself.
 *
 * Constraints:
 * - The answer crosses a process boundary and is checked before use; a file without a path is dropped
 */

import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { ParsedDiffFile } from "@/git/use-diff-query";

const GROUPON_DESK_RPC_PLUGIN_ID = "groupon-desk";
const SESSION_CHANGES_RPC = "groupon-desk.session.changes";

export interface SessionChangesRepo {
  root: string;
  name: string;
  branch: string | null;
  baseline: string | null;
  files: ParsedDiffFile[];
  diffTooLarge: boolean;
  error: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

function repoOf(value: unknown): SessionChangesRepo | null {
  if (!isRecord(value) || typeof value.root !== "string" || typeof value.name !== "string") {
    return null;
  }
  const files = Array.isArray(value.files)
    ? value.files.filter(
        (file): file is ParsedDiffFile =>
          isRecord(file) && typeof file.path === "string" && Array.isArray(file.hunks),
      )
    : [];
  return {
    root: value.root,
    name: value.name,
    branch: text(value.branch),
    baseline: text(value.baseline),
    files,
    diffTooLarge: value.diffTooLarge === true,
    error: text(value.error),
  };
}

/** The daemon's answer, checked: the repositories in the order the session first touched them. */
export async function readSessionChanges(
  client: Pick<DaemonClient, "invokePluginRpc">,
  workspaceId: string,
): Promise<SessionChangesRepo[]> {
  const answer = await client.invokePluginRpc(GROUPON_DESK_RPC_PLUGIN_ID, SESSION_CHANGES_RPC, {
    workspaceId,
  });
  const repos = isRecord(answer) && Array.isArray(answer.repos) ? answer.repos : [];
  return repos.map(repoOf).filter((repo): repo is SessionChangesRepo => repo !== null);
}

/** Each repository's label: its name, with its branch when two share a name (two worktrees). */
function repoLabels(repos: readonly SessionChangesRepo[]): string[] {
  return repos.map((repo) => {
    const twins = repos.filter((other) => other.name === repo.name).length > 1;
    return twins && repo.branch ? `${repo.name} (${repo.branch})` : repo.name;
  });
}

/** The repositories' files as one list; each path under its repository's label when there are several. */
export function sessionDiffFiles(repos: readonly SessionChangesRepo[]): ParsedDiffFile[] {
  if (repos.length === 1) return repos[0]?.files ?? [];
  const labels = repoLabels(repos);
  return repos.flatMap((repo, index) => {
    const label = labels[index] ?? repo.name;
    return repo.files.map((file) => ({
      ...file,
      path: `${label}/${file.path}`,
      ...(file.oldPath ? { oldPath: `${label}/${file.oldPath}` } : {}),
    }));
  });
}

/** The absolute path of a file as `sessionDiffFiles` names it, for opening it; null when unknown. */
export function sessionFileLocation(
  repos: readonly SessionChangesRepo[],
  listedPath: string,
): string | null {
  if (repos.length === 1) {
    const repo = repos[0];
    return repo ? `${repo.root}/${listedPath}` : null;
  }
  const labels = repoLabels(repos);
  for (const [index, repo] of repos.entries()) {
    const prefix = `${labels[index] ?? repo.name}/`;
    if (listedPath.startsWith(prefix)) return `${repo.root}/${listedPath.slice(prefix.length)}`;
  }
  return null;
}

/**
 * The path to open for a listed file: relative to the workspace when it lies in it, else absolute
 * (the daemon serves a file a session edited in another repository); the listed path when unknown.
 */
export function sessionFileTarget(
  repos: readonly SessionChangesRepo[],
  listedPath: string,
  workspaceRoot: string,
): string {
  const location = sessionFileLocation(repos, listedPath);
  if (!location) return listedPath;
  const root = workspaceRoot.replace(/\/+$/, "");
  return location.startsWith(`${root}/`) ? location.slice(root.length + 1) : location;
}

/** Whether a failed read came from a daemon older than the session comparison. */
export function sessionChangesUnsupported(error: unknown): boolean {
  return /Unknown Groupon Desk method/.test(error instanceof Error ? error.message : String(error));
}

/** One line for the repositories that could not be diffed; null when all were. */
export function sessionChangesError(repos: readonly SessionChangesRepo[]): string | null {
  const failed = repos.filter((repo) => repo.error);
  return failed.length > 0 ? failed.map((repo) => `${repo.name}: ${repo.error}`).join("; ") : null;
}
