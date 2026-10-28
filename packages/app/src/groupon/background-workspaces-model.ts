// Added for Groupon Desk (fork of Paseo, Apache-2.0): which workspaces have an agent's background task running (a Monitor watch, a background command), read from the daemon for the sidebar.

import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";

const GROUPON_DESK_RPC_PLUGIN_ID = "groupon-desk";
const BACKGROUND_WORKSPACES_RPC = "groupon-desk.workspaces.background";

/** How often the sidebar asks again: a watch's start or end shows within this. */
export const BACKGROUND_WORKSPACES_REFRESH_MS = 15_000;

/** The daemon's answer, checked: the ids of the workspaces with a background task running. */
export async function readBackgroundWorkspaceIds(
  client: Pick<DaemonClient, "invokePluginRpc">,
): Promise<string[]> {
  const answer = await client.invokePluginRpc(
    GROUPON_DESK_RPC_PLUGIN_ID,
    BACKGROUND_WORKSPACES_RPC,
    {},
  );
  const ids =
    typeof answer === "object" && answer !== null && "workspaceIds" in answer
      ? (answer as { workspaceIds: unknown }).workspaceIds
      : [];
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}
