// Added for Groupon Desk (fork of Paseo, Apache-2.0): the workspaces a release train archived, as the daemon answers them.

/**
 * Before the shared-trunk rule, auto-archive-on-merge archived a workspace when the release
 * train's pull request (head `staging`) merged, because the workspace had been matched to it.
 * The daemon lists those archives (`groupon-desk.train-archived-workspaces`, answered by the
 * daemon itself, plugin id `groupon-desk`); Restore is Paseo's own workspace recovery.
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
  pullRequestUrl: string;
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
    typeof value.pullRequestUrl === "string" &&
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

/** `#371 (head staging), archived 19 Oct 2026, 09:00 · ctzaruba/one` */
export function trainArchivedHint(workspace: TrainArchivedWorkspace): string {
  const number = workspace.pullRequestUrl.match(/\/(\d+)(?:[/?#]|$)/)?.[1];
  const when = new Date(workspace.archivedAt);
  const archived = Number.isNaN(when.getTime()) ? workspace.archivedAt : when.toLocaleString();
  return [
    `${number ? `#${number}` : workspace.pullRequestUrl} (head ${workspace.pullRequestHead}), archived ${archived}`,
    workspace.branch,
  ]
    .filter(Boolean)
    .join(" · ");
}
