// Added for Groupon Desk (fork of Paseo, Apache-2.0): a workspace's Changes switch once to the comparison its agent asked for when the chat moved there.

import { useEffect } from "react";
import { useFetchQuery } from "@/data/query";
import { applyRequestedComparison } from "@/git/working-diff-comparison";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import {
  readRequestedCompares,
  REQUESTED_COMPARE_REFRESH_MS,
  type RequestedCompare,
} from "./requested-compare-model";

const NONE: Record<string, RequestedCompare> = {};

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
  const comparison = request?.comparison;
  const requestedAt = request?.requestedAt;
  useEffect(() => {
    if (!comparison || !requestedAt || !workspaceId) return;
    applyRequestedComparison({ serverId, workspaceId, cwd: "", comparison, requestedAt });
  }, [comparison, requestedAt, serverId, workspaceId]);
  return request;
}
