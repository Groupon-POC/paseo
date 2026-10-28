// Added for Groupon Desk (fork of Paseo, Apache-2.0): the Changes comparison an agent asked for the workspace its chat moved into, read from the daemon.

import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { WorkingDiffComparison } from "@/git/working-diff-comparison/state";

const GROUPON_DESK_RPC_PLUGIN_ID = "groupon-desk";
const WORKSPACE_COMPARE_RPC = "groupon-desk.workspaces.compare";
const COMPARISONS: ReadonlySet<string> = new Set<WorkingDiffComparison>([
  "session",
  "session-committed",
  "session-uncommitted",
  "uncommitted",
  "base",
  "all",
]);

/** How often an open chat asks again: a moved chat's comparison shows within this. */
export const REQUESTED_COMPARE_REFRESH_MS = 5_000;

export interface RequestedCompare {
  comparison: WorkingDiffComparison;
  /** The ref the base comparison diffs against (a pull request's base); null for the checkout's own. */
  baseRef: string | null;
  requestedAt: string;
}

function requestOf(value: unknown): RequestedCompare | null {
  if (typeof value !== "object" || value === null) return null;
  const { comparison, baseRef, requestedAt } = value as Record<string, unknown>;
  if (typeof comparison !== "string" || !COMPARISONS.has(comparison)) return null;
  if (typeof requestedAt !== "string") return null;
  return {
    comparison: comparison as WorkingDiffComparison,
    baseRef: typeof baseRef === "string" && baseRef !== "" ? baseRef : null,
    requestedAt,
  };
}

/** The daemon's answer, checked, by workspace id; none from a daemon that predates the request. */
export function requestedComparesOf(answer: unknown): Record<string, RequestedCompare> {
  const requests =
    typeof answer === "object" && answer !== null && "requests" in answer
      ? (answer as { requests: unknown }).requests
      : null;
  if (typeof requests !== "object" || requests === null) return {};
  const read: Record<string, RequestedCompare> = {};
  for (const [workspaceId, value] of Object.entries(requests)) {
    const request = requestOf(value);
    if (request) read[workspaceId] = request;
  }
  return read;
}

export async function readRequestedCompares(
  client: Pick<DaemonClient, "invokePluginRpc">,
): Promise<Record<string, RequestedCompare>> {
  try {
    return requestedComparesOf(
      await client.invokePluginRpc(GROUPON_DESK_RPC_PLUGIN_ID, WORKSPACE_COMPARE_RPC, {}),
    );
  } catch {
    return {};
  }
}
