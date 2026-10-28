// Added for Groupon Desk (fork of Paseo, Apache-2.0): a workspace's session changes, read while a Changes view shows them.

import { useMemo } from "react";
import { useFetchQuery } from "@/data/query";
import type { SessionChangesMode } from "@/git/working-diff-comparison/state";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import {
  readSessionChanges,
  sessionChangesError,
  sessionChangesUnsupported,
  sessionDiffFiles,
  type SessionChangesRepo,
} from "./session-changes-model";

/** How often a shown session diff is read again while the session may still be editing. */
const SESSION_CHANGES_REFRESH_MS = 4_000;
const NO_REPOS: SessionChangesRepo[] = [];

export function sessionChangesQueryKey(
  serverId: string,
  workspaceId: string | null | undefined,
  mode: SessionChangesMode = "all",
) {
  return ["groupon-session-changes", serverId, workspaceId ?? "", mode] as const;
}

/** What the workspace's sessions changed, as one file list, read again every few seconds while enabled. */
export function useSessionChanges(input: {
  serverId: string;
  workspaceId?: string | null;
  enabled: boolean;
  mode?: SessionChangesMode;
}) {
  const mode = input.mode ?? "all";
  const client = useHostRuntimeClient(input.serverId);
  const connected = useHostRuntimeIsConnected(input.serverId);
  const workspaceId = input.workspaceId ?? null;
  const active = input.enabled && Boolean(client) && connected && workspaceId !== null;
  const query = useFetchQuery({
    queryKey: sessionChangesQueryKey(input.serverId, workspaceId, mode),
    queryFn: async () => {
      if (!client || !workspaceId) return NO_REPOS;
      return readSessionChanges(client, workspaceId, mode);
    },
    enabled: active,
    dataShape: "value",
    retry: false,
    staleTimeMs: 0,
    refetchInterval: (state) =>
      active && !sessionChangesUnsupported(state.state.error) ? SESSION_CHANGES_REFRESH_MS : false,
  });
  // A daemon older than the session comparison: the views compare the checkout instead.
  const unsupported = query.error !== null && sessionChangesUnsupported(query.error);
  const repos = query.data ?? NO_REPOS;
  const files = useMemo(() => sessionDiffFiles(repos), [repos]);
  const message =
    sessionChangesError(repos) ?? (query.error instanceof Error ? query.error.message : null);
  return {
    repos,
    files,
    payloadError: message ? { code: "UNKNOWN" as const, message } : null,
    diffTooLarge: repos.some((repo) => repo.diffTooLarge),
    isLoading: active && query.isLoading,
    /** The Mac's daemon predates the session comparison. */
    unsupported,
    refetch: query.refetch,
  };
}
