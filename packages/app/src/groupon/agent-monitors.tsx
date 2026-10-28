// Added for Groupon Desk (fork of Paseo, Apache-2.0): a pill above the composer, a little apart from Share, while the agent has Monitor watches running; its radar breathes.

import { memo, useEffect, useMemo, type ReactElement } from "react";
import { Text, View } from "react-native";
import { Radar } from "lucide-react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { composerPillStyles } from "@/composer/pill-styles";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import type { Theme } from "@/styles/theme";
import { isAgentToolCallItem } from "@/types/stream";
import {
  type AgentMonitor,
  monitorLine,
  monitorsPillLabel,
  readAgentMonitors,
  runningMonitors,
} from "./agent-monitors-model";
import { GROUPON_MONITORS } from "./strings";

/** How often the watches are read again: a watch may end by its timeout with nothing in the chat. */
const MONITORS_REFRESH_MS = 15_000;
const NO_MONITORS: AgentMonitor[] = [];
/** The tool calls that start or end a watch; a new one reads the watches again at once. */
const MONITOR_TOOLS = new Set(["Monitor", "TaskStop", "task_notification"]);

const ThemedRadar = withUnistyles(Radar);
const liveColor = (theme: Theme) => ({ color: theme.colors.accent });

/** The radar breathes while a watch runs: a slow pulse of its size and strength. */
function LiveRadar(): ReactElement {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.45 + pulse.value * 0.55,
    transform: [{ scale: 0.88 + pulse.value * 0.2 }],
  }));
  return (
    <Animated.View style={style} testID="groupon-agent-monitors-live">
      <ThemedRadar size={14} uniProps={liveColor} />
    </Animated.View>
  );
}

/** The id of the agent's latest tool call that starts or ends a watch, from its loaded stream. */
function useLatestMonitorCall(serverId: string, agentId: string): string | null {
  return useSessionStore((state) => {
    const items = state.sessions[serverId]?.agentStreamTail?.get(agentId);
    if (!items) return null;
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (item && isAgentToolCallItem(item) && MONITOR_TOOLS.has(item.payload.data.name)) {
        return `${item.id}:${item.payload.data.status}`;
      }
    }
    return null;
  });
}

/** The Monitor watches the agent has running, read from the daemon and again as they change. */
export function useAgentMonitors(serverId: string, agentId: string): AgentMonitor[] {
  const client = useHostRuntimeClient(serverId);
  const connected = useHostRuntimeIsConnected(serverId);
  const active = Boolean(client) && connected && agentId.length > 0;
  const query = useFetchQuery({
    queryKey: ["groupon-agent-monitors", serverId, agentId],
    queryFn: async () => (client ? readAgentMonitors(client, agentId) : NO_MONITORS),
    enabled: active,
    dataShape: "value",
    retry: false,
    staleTimeMs: MONITORS_REFRESH_MS,
    refetchInterval: active ? MONITORS_REFRESH_MS : false,
  });
  const latestCall = useLatestMonitorCall(serverId, agentId);
  const { refetch } = query;
  useEffect(() => {
    if (active && latestCall) void refetch();
  }, [active, latestCall, refetch]);
  const monitors = query.data ?? NO_MONITORS;
  return useMemo(() => runningMonitors(monitors, Date.now()), [monitors]);
}

/** The pill: a breathing radar and "2 monitors"; its tooltip names each watch and the time it has left. */
export const AgentMonitorsPill = memo(function AgentMonitorsPill({
  monitors,
}: {
  monitors: readonly AgentMonitor[];
}): ReactElement | null {
  if (monitors.length === 0) return null;
  const label = monitorsPillLabel(monitors.length);
  const now = Date.now();
  return (
    <View style={[composerPillStyles.body, styles.pill]} testID="groupon-agent-monitors">
      <Tooltip delayDuration={150} enabledOnDesktop enabledOnMobile>
        <TooltipTrigger accessibilityRole="text" accessibilityLabel={label} style={styles.trigger}>
          <LiveRadar />
          <Text style={composerPillStyles.label}>{label}</Text>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" offset={8}>
          <Text style={styles.tooltipTitle}>{GROUPON_MONITORS.tooltipTitle}</Text>
          {monitors.map((monitor) => (
            <Text key={monitor.taskId} style={styles.tooltipText}>
              {monitorLine(monitor, now)}
            </Text>
          ))}
        </TooltipContent>
      </Tooltip>
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  // Apart from Share and the people beside it: the watches are the agent's, not the room's.
  pill: { marginLeft: theme.spacing[2] },
  trigger: { flexDirection: "row", alignItems: "center", gap: theme.spacing[1] },
  tooltipTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
  },
  tooltipText: { fontSize: theme.fontSize.sm, color: theme.colors.foregroundMuted },
}));
