// Added for Groupon Desk (fork of Paseo, Apache-2.0): a sidebar row shows its checkout's pull request only when its chat worked on the branch, among the chats sharing the checkout.

import { useMemo } from "react";
import { useFetchQuery } from "@/data/query";
import type { PrHint } from "@/git/pr-hint";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import {
  readWorkedWorkspaceIds,
  showsCheckoutPullRequest,
  WORKED_WORKSPACES_REFRESH_MS,
} from "./worked-workspaces-model";

const NONE: string[] = [];

export function useShownPrHint(row: {
  serverId: string;
  workspaceId: string;
  workspaceKind: string;
  workspaceDirectory: string;
  prHint: PrHint | null;
}): PrHint | null {
  const sharedCheckout = row.workspaceKind !== "worktree" && row.prHint !== null;
  // The other workspaces on the same checkout, as one stable string.
  const siblings = useSessionStore((state) => {
    if (!sharedCheckout) return "";
    const ids: string[] = [];
    for (const workspace of state.sessions[row.serverId]?.workspaces?.values() ?? []) {
      if (
        workspace.id !== row.workspaceId &&
        workspace.workspaceKind !== "worktree" &&
        workspace.workspaceDirectory === row.workspaceDirectory
      ) {
        ids.push(workspace.id);
      }
    }
    return ids.sort().join("\n");
  });
  const client = useHostRuntimeClient(row.serverId);
  const connected = useHostRuntimeIsConnected(row.serverId);
  const active = siblings !== "" && Boolean(client) && connected;
  const query = useFetchQuery({
    queryKey: ["groupon-worked-workspaces", row.serverId],
    queryFn: async () => (client ? readWorkedWorkspaceIds(client) : NONE),
    enabled: active,
    dataShape: "value",
    retry: false,
    staleTimeMs: WORKED_WORKSPACES_REFRESH_MS,
    refetchInterval: active ? WORKED_WORKSPACES_REFRESH_MS : false,
  });
  const worked = useMemo(() => new Set(query.data ?? NONE), [query.data]);
  const shows = showsCheckoutPullRequest({
    workspaceId: row.workspaceId,
    sharedCheckout,
    siblingIds: siblings === "" ? NONE : siblings.split("\n"),
    worked,
  });
  return shows ? row.prHint : null;
}
