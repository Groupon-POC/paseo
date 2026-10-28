// Added for Groupon Desk (fork of Paseo, Apache-2.0): a workspace's Changes switch once to the comparison its agent asked for when the chat moved there.

import { useEffect } from "react";
import { useFetchQuery } from "@/data/query";
import { selectWorkingDiffComparison } from "@/git/working-diff-comparison";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import {
  readRequestedCompares,
  REQUESTED_COMPARE_REFRESH_MS,
  type RequestedCompare,
} from "./requested-compare-model";

const NONE: Record<string, RequestedCompare> = {};
/** The request each workspace last took, so a person's own pick afterwards stays. */
const APPLIED = new Map<string, string>();

/** The comparison the workspace's agent asked for, applied to the Changes once per request. */
export function useRequestedCompare(
  serverId: string,
  workspaceId: string | null | undefined,
): RequestedCompare | null {
  const client = useHostRuntimeClient(serverId);
  const connected = useHostRuntimeIsConnected(serverId);
  const active = Boolean(client) && connected && Boolean(workspaceId);
  const query = useFetchQuery({
    queryKey: ["groupon-requested-compares", serverId],
    queryFn: async () => (client ? readRequestedCompares(client) : NONE),
    enabled: active,
    dataShape: "value",
    retry: false,
    staleTimeMs: REQUESTED_COMPARE_REFRESH_MS,
    refetchInterval: active ? REQUESTED_COMPARE_REFRESH_MS : false,
  });
  const request = workspaceId ? ((query.data ?? NONE)[workspaceId] ?? null) : null;
  useEffect(() => {
    if (!request || !workspaceId) return;
    const key = `${serverId}:${workspaceId}`;
    if (APPLIED.get(key) === request.requestedAt) return;
    APPLIED.set(key, request.requestedAt);
    selectWorkingDiffComparison({ serverId, workspaceId, cwd: "", comparison: request.comparison });
  }, [request, serverId, workspaceId]);
  return request;
}
