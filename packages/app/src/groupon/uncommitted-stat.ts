// Added for Groupon Desk (fork of Paseo, Apache-2.0): the archive warning counts what a worktree has not committed yet, read from its daemon, not the branch's diff against its base.
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { GROUPON_DESK_RPC_PLUGIN_ID } from "./train-archived-model";

const UNCOMMITTED_STAT_RPC = "groupon-desk.checkout.uncommitted-stat";

export interface UncommittedStat {
  additions: number;
  deletions: number;
}

export function uncommittedStatOf(answer: unknown): UncommittedStat | null {
  const stat =
    typeof answer === "object" && answer !== null
      ? (answer as Record<string, unknown>).stat
      : undefined;
  if (typeof stat !== "object" || stat === null) return null;
  const { additions, deletions } = stat as Record<string, unknown>;
  return typeof additions === "number" && typeof deletions === "number"
    ? { additions, deletions }
    : null;
}

/** Null when nothing is left uncommitted, or when the daemon predates the read. */
export async function readUncommittedStat(
  client: Pick<DaemonClient, "invokePluginRpc">,
  workspaceId: string,
): Promise<UncommittedStat | null> {
  try {
    return uncommittedStatOf(
      await client.invokePluginRpc(GROUPON_DESK_RPC_PLUGIN_ID, UNCOMMITTED_STAT_RPC, {
        workspaceId,
      }),
    );
  } catch {
    return null;
  }
}
