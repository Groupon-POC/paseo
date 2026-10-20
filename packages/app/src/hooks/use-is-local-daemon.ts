// Changed for Groupon Desk (fork of Paseo, Apache-2.0): no desktop daemon to look for while the hand owns this Mac's.
import { useQuery } from "@tanstack/react-query";
import { getDesktopDaemonStatus, shouldUseDesktopDaemon } from "@/desktop/daemon/desktop-daemon";
import { GROUPON_DESK_HAND_OWNS_DAEMON } from "@/groupon/pairing-policy";

const DESKTOP_DAEMON_SERVER_ID_QUERY_KEY = ["desktop-daemon-server-id"] as const;

interface DesktopDaemonServerIdResult {
  serverId: string | null;
}

async function loadDesktopDaemonServerId(): Promise<DesktopDaemonServerIdResult> {
  const status = await getDesktopDaemonStatus();
  const serverId = status.serverId.trim();
  return {
    serverId: serverId.length > 0 ? serverId : null,
  };
}

// The hand's daemon is reached like any hub Mac, never as the window's own "local daemon", so its
// host shows no stop or manage controls and nothing polls the desktop once a second for one.
function isDesktopDaemonApp(): boolean {
  return !GROUPON_DESK_HAND_OWNS_DAEMON && shouldUseDesktopDaemon();
}

function useLocalDaemonServerIdQuery() {
  const isDesktopApp = isDesktopDaemonApp();

  return useQuery({
    queryKey: DESKTOP_DAEMON_SERVER_ID_QUERY_KEY,
    queryFn: loadDesktopDaemonServerId,
    enabled: isDesktopApp,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchInterval: (activeQuery) => (activeQuery.state.data?.serverId ? false : 1000),
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useLocalDaemonServerId(): string | null {
  const isDesktopApp = isDesktopDaemonApp();
  const query = useLocalDaemonServerIdQuery();

  if (!isDesktopApp) {
    return null;
  }

  return query.data?.serverId ?? null;
}

export type LocalDaemonServerIdState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "resolved"; serverId: string | null };

export function useLocalDaemonServerIdState(): LocalDaemonServerIdState {
  const isDesktopApp = isDesktopDaemonApp();
  const query = useLocalDaemonServerIdQuery();

  if (!isDesktopApp) {
    return { status: "resolved", serverId: null };
  }
  if (query.isError) {
    return { status: "error" };
  }
  if (query.isSuccess) {
    return { status: "resolved", serverId: query.data.serverId };
  }
  return { status: "loading" };
}

export function useIsLocalDaemon(serverId: string): boolean {
  const normalizedServerId = serverId.trim();
  const localServerId = useLocalDaemonServerId();

  if (localServerId === null || normalizedServerId.length === 0) {
    return false;
  }

  return localServerId === normalizedServerId;
}
