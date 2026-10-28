// Added for Groupon Desk (fork of Paseo, Apache-2.0): the sidebar's question "does this workspace run a background task?", one daemon read per host every few seconds.

import { useMemo } from "react";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import {
  BACKGROUND_WORKSPACES_REFRESH_MS,
  readBackgroundWorkspaceIds,
} from "./background-workspaces-model";

const NONE: string[] = [];

/**
 * True while an agent of the workspace runs a Monitor watch or a background command. Every row of
 * a host shares one query, so the daemon is asked once per host however many rows show.
 */
export function useWorkspaceRunsInBackground(serverId: string, workspaceId: string): boolean {
  const client = useHostRuntimeClient(serverId);
  const connected = useHostRuntimeIsConnected(serverId);
  const active = Boolean(client) && connected;
  const query = useFetchQuery({
    queryKey: ["groupon-background-workspaces", serverId],
    queryFn: async () => (client ? readBackgroundWorkspaceIds(client) : NONE),
    enabled: active,
    dataShape: "value",
    retry: false,
    staleTimeMs: BACKGROUND_WORKSPACES_REFRESH_MS,
    refetchInterval: active ? BACKGROUND_WORKSPACES_REFRESH_MS : false,
  });
  const ids = query.data ?? NONE;
  return useMemo(() => ids.includes(workspaceId), [ids, workspaceId]);
}
