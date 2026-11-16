// Added for Groupon Desk (fork of Paseo, Apache-2.0): the sidebar's question "does this workspace run a background task?", one daemon read per host every few seconds; the same read for every host of the status groups.

import { useMemo } from "react";
import { useFetchQueries, useFetchQuery } from "@/data/query";
import {
  getHostRuntimeStore,
  useHostRuntimeClient,
  useHostRuntimeConnectionStatuses,
  useHostRuntimeIsConnected,
} from "@/runtime/host-runtime";
import {
  BACKGROUND_WORKSPACES_REFRESH_MS,
  readBackgroundWorkspaceIds,
} from "./background-workspaces-model";

const NONE: string[] = [];
const ID_SEPARATOR = "\u0000";
const HOST_SEPARATOR = "\u0001";

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

// Keyed like the rows' query, so the rows and the status groups share one read per host.
export function useBackgroundWorkspaceIdsByServer(
  serverIds: readonly string[],
  enabled: boolean,
): ReadonlyMap<string, readonly string[]> {
  const statuses = useHostRuntimeConnectionStatuses(serverIds);
  const results = useFetchQueries(
    serverIds.map((serverId) => {
      const active = enabled && statuses.get(serverId) === "online";
      return {
        queryKey: ["groupon-background-workspaces", serverId],
        queryFn: async () => {
          const client = getHostRuntimeStore().getClient(serverId);
          return client ? readBackgroundWorkspaceIds(client) : NONE;
        },
        enabled: active,
        dataShape: "value" as const,
        retry: false,
        staleTimeMs: BACKGROUND_WORKSPACES_REFRESH_MS,
        refetchInterval: active ? BACKGROUND_WORKSPACES_REFRESH_MS : (false as const),
      };
    }),
  );
  // The answers joined into one string, so the map changes only when an answer does.
  const answers = results
    .map((result) => (result.data ?? NONE).join(ID_SEPARATOR))
    .join(HOST_SEPARATOR);
  return useMemo(() => {
    const perHost = answers.split(HOST_SEPARATOR);
    return new Map(
      serverIds.map((serverId, index) => {
        const ids = perHost[index] ?? "";
        return [serverId, ids.length > 0 ? ids.split(ID_SEPARATOR) : NONE] as const;
      }),
    );
  }, [serverIds, answers]);
}
