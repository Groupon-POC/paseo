// Added for Groupon Desk (fork of Paseo, Apache-2.0): "Copy session ID" in a session's menu in the sidebar.

import { useCallback, useMemo } from "react";
import { Text } from "react-native";
import { Copy } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useToast } from "@/contexts/toast-context";
import { useSessionStore } from "@/stores/session-store";
import type { Theme } from "@/styles/theme";
import { GROUPON_SESSION_ID } from "./strings";

const ThemedCopy = withUnistyles(Copy);
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const leadingIcon = <ThemedCopy size={14} uniProps={foregroundMutedColorMapping} />;

/**
 * The session a workspace row stands for: its chat (the agent that is not a subagent, not
 * archived), the latest active when there are several. Its id is the session id the desk's tools
 * and `GROUPON_DESK_SESSION_ID` name.
 */
export function useWorkspaceSessionId(
  serverId: string | null | undefined,
  workspaceId: string | null | undefined,
): string | null {
  return useSessionStore((state) => {
    if (!serverId || !workspaceId) return null;
    const agents = state.sessions[serverId]?.agents;
    if (!agents) return null;
    let latest: { id: string; at: number } | null = null;
    for (const agent of agents.values()) {
      if (agent.workspaceId !== workspaceId || agent.archivedAt || agent.parentAgentId) continue;
      const at = agent.lastActivityAt.getTime();
      if (!latest || at > latest.at) latest = { id: agent.id, at };
    }
    return latest?.id ?? null;
  });
}

export function CopySessionIdMenuItem({
  serverId,
  workspaceId,
  testID,
  surface = "dropdown",
}: {
  serverId?: string | null;
  workspaceId?: string | null;
  testID: string;
  surface?: "context" | "dropdown";
}) {
  const sessionId = useWorkspaceSessionId(serverId, workspaceId);
  const toast = useToast();
  const copy = useCallback(() => {
    if (!sessionId) return;
    Clipboard.setStringAsync(sessionId)
      .then(() => toast.copied(GROUPON_SESSION_ID.copied))
      .catch(() => toast.error(GROUPON_SESSION_ID.copyFailed));
  }, [sessionId, toast]);
  const trailing = useMemo(
    () => (sessionId ? <Text style={styles.hint}>{sessionId.slice(0, 7)}</Text> : null),
    [sessionId],
  );
  if (!sessionId) return null;
  const Item = surface === "context" ? ContextMenuItem : DropdownMenuItem;
  return (
    <Item testID={testID} leading={leadingIcon} trailing={trailing} onSelect={copy}>
      {GROUPON_SESSION_ID.copy}
    </Item>
  );
}

const styles = StyleSheet.create((theme) => ({
  hint: {
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
}));
