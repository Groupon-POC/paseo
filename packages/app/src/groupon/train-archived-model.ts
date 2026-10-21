// Added for Groupon Desk (fork of Paseo, Apache-2.0): the workspaces a release train archived, as the daemon answers them.

/**
 * Before the shared-trunk rule, auto-archive-on-merge archived a workspace when the release
 * train's pull request (head `staging`) merged, because the workspace had been matched to it.
 * The daemon lists those archives (`groupon-desk.train-archived-workspaces`, answered by the
 * daemon itself, plugin id `groupon-desk`): every archived workspace on a shared trunk, with or
 * without the pull request's address on its record, and every one on its own branch whose pull
 * request's head was a trunk. Restore is Paseo's own workspace recovery; a trunk workspace's
 * removed worktree comes back cut from the trunk's current head.
 */

import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";

export const GROUPON_DESK_RPC_PLUGIN_ID = "groupon-desk";
export const TRAIN_ARCHIVED_METHOD = "groupon-desk.train-archived-workspaces";

export interface TrainArchivedWorkspace {
  workspaceId: string;
  projectId: string;
  name: string;
  branch: string | null;
  cwd: string;
  archivedAt: string;
  /** Null for a trunk workspace whose record kept no pull request (the daemons of 2026-10-20). */
  pullRequestUrl: string | null;
  /** The trunk it was archived on. */
  pullRequestHead: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTrainArchivedWorkspace(value: unknown): value is TrainArchivedWorkspace {
  return (
    isRecord(value) &&
    typeof value.workspaceId === "string" &&
    typeof value.name === "string" &&
    typeof value.archivedAt === "string" &&
    (typeof value.pullRequestUrl === "string" || value.pullRequestUrl === null) &&
    typeof value.pullRequestHead === "string"
  );
}

/** The daemon's answer as a list; throws on any other shape (an older daemon answers with an error). */
export function parseTrainArchived(output: unknown): TrainArchivedWorkspace[] {
  if (!isRecord(output) || !Array.isArray(output.workspaces)) {
    throw new Error("The archived workspaces came back in a shape this window does not read.");
  }
  return output.workspaces.filter(isTrainArchivedWorkspace);
}

export async function readTrainArchived(
  client: Pick<DaemonClient, "invokePluginRpc">,
): Promise<TrainArchivedWorkspace[]> {
  return parseTrainArchived(
    await client.invokePluginRpc(GROUPON_DESK_RPC_PLUGIN_ID, TRAIN_ARCHIVED_METHOD, {}),
  );
}

/**
 * `#371 (head staging), archived 19 Oct 2026, 09:00 · ctzaruba/one`; a trunk workspace without a
 * pull request: `On staging, archived 20 Oct 2026, 11:35 · /Users/t/GitHub/engineering-development`.
 */
export function trainArchivedHint(workspace: TrainArchivedWorkspace): string {
  const when = new Date(workspace.archivedAt);
  const archived = Number.isNaN(when.getTime()) ? workspace.archivedAt : when.toLocaleString();
  const url = workspace.pullRequestUrl;
  if (!url) {
    return [`On ${workspace.pullRequestHead}, archived ${archived}`, workspace.cwd]
      .filter(Boolean)
      .join(" · ");
  }
  const number = url.match(/\/(\d+)(?:[/?#]|$)/)?.[1];
  return [
    `${number ? `#${number}` : url} (head ${workspace.pullRequestHead}), archived ${archived}`,
    workspace.branch,
  ]
    .filter(Boolean)
    .join(" · ");
}
