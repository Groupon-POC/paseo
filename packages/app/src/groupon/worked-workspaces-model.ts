// Added for Groupon Desk (fork of Paseo, Apache-2.0): which chats sharing a checkout worked on its branch, so its pull request shows on those only.

import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";

const GROUPON_DESK_RPC_PLUGIN_ID = "groupon-desk";
const WORKED_WORKSPACES_RPC = "groupon-desk.workspaces.worked";

/** How often the sidebar asks again: a push shows on its chat within this. */
export const WORKED_WORKSPACES_REFRESH_MS = 15_000;

export async function readWorkedWorkspaceIds(
  client: Pick<DaemonClient, "invokePluginRpc">,
): Promise<string[]> {
  try {
    const answer = await client.invokePluginRpc(
      GROUPON_DESK_RPC_PLUGIN_ID,
      WORKED_WORKSPACES_RPC,
      {},
    );
    const ids =
      typeof answer === "object" && answer !== null && "workspaceIds" in answer
        ? (answer as { workspaceIds: unknown }).workspaceIds
        : [];
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Whether a workspace shows its checkout's pull request. A worktree's branch is its own; on a
 * checkout several chats share, the pull request shows on the chats that worked on the branch,
 * and on all of them while none has (or the daemon cannot tell).
 */
export function showsCheckoutPullRequest(input: {
  workspaceId: string;
  sharedCheckout: boolean;
  /** The other workspaces on the same checkout. */
  siblingIds: readonly string[];
  worked: ReadonlySet<string>;
}): boolean {
  if (!input.sharedCheckout || input.siblingIds.length === 0) return true;
  const anyWorked = [input.workspaceId, ...input.siblingIds].some((id) => input.worked.has(id));
  return !anyWorked || input.worked.has(input.workspaceId);
}
