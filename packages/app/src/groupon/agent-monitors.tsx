// Added for Groupon Desk (fork of Paseo, Apache-2.0): a pill above the composer, a little apart from Share, while the agent has Monitor watches running; its radar breathes, and its panel lists each watch with the time it has left and stops it.

import { memo, useCallback, useEffect, useMemo, type ReactElement } from "react";
import { Text, View } from "react-native";
import { CircleStop } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ComposerTrackPill, ComposerTrackRow } from "@/composer/tracks";
import { paneContentToolbarIconSize, ToolbarButton } from "@/components/ui/pane-content-toolbar";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useToast } from "@/contexts/toast-context";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import type { Theme } from "@/styles/theme";
import { isAgentToolCallItem } from "@/types/stream";
import {
  type AgentMonitor,
  monitorTimeLeft,
  monitorsPillLabel,
  readAgentMonitors,
  runningMonitors,
  stopAgentMonitor,
} from "./agent-monitors-model";
import { LiveRadar } from "./live-radar";
import { useTickingNow } from "./use-ticking-now";
import { GROUPON_MONITORS } from "./strings";

/** How often the watches are read again: a watch may end by its timeout with nothing in the chat. */
const MONITORS_REFRESH_MS = 15_000;
const NO_MONITORS: AgentMonitor[] = [];
/** The tool calls that start or end a watch; a new one reads the watches again at once. */
const MONITOR_TOOLS = new Set(["Monitor", "TaskStop", "task_notification"]);

function monitorsQueryKey(serverId: string, agentId: string) {
  return ["groupon-agent-monitors", serverId, agentId] as const;
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
    queryKey: monitorsQueryKey(serverId, agentId),
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

/** Stops one of the agent's watches, then reads the list again; tells the person if it was gone. */
function useStopMonitor(serverId: string, agentId: string): (taskId: string) => void {
  const client = useHostRuntimeClient(serverId);
  const queryClient = useQueryClient();
  const toast = useToast();
  return useCallback(
    (taskId: string) => {
      if (!client) return;
      void stopAgentMonitor(client, agentId, taskId)
        .then((stopped) => {
          if (!stopped) toast.error(GROUPON_MONITORS.notRunning);
          return queryClient.invalidateQueries({ queryKey: monitorsQueryKey(serverId, agentId) });
        })
        .catch((error: unknown) =>
          toast.error(error instanceof Error ? error.message : String(error)),
        );
    },
    [agentId, client, queryClient, serverId, toast],
  );
}

/**
 * The pill: a breathing radar and "2 monitors". Pressing it opens the track panel (the subagents'
 * family): each watch with its command and the time it has left, and a button that stops it.
 */
export const AgentMonitorsPill = memo(function AgentMonitorsPill({
  serverId,
  agentId,
  monitors,
}: {
  serverId: string;
  agentId: string;
  monitors: readonly AgentMonitor[];
}): ReactElement | null {
  const stop = useStopMonitor(serverId, agentId);
  const label = monitorsPillLabel(monitors.length);
  const segments = useMemo(() => [{ bucket: null, text: label }], [label]);
  if (monitors.length === 0) return null;
  return (
    <View style={styles.pill}>
      <ComposerTrackPill
        leading={LIVE_RADAR}
        segments={segments}
        panelTitle={GROUPON_MONITORS.panelTitle}
        accessibilityLabel={label}
        testID="groupon-agent-monitors"
      >
        <MonitorsPanel monitors={monitors} onStop={stop} />
      </ComposerTrackPill>
    </View>
  );
});

const LIVE_RADAR = <LiveRadar />;

/** The panel's rows; mounted only while it is open, so its clock ticks only then. */
function MonitorsPanel({
  monitors,
  onStop,
}: {
  monitors: readonly AgentMonitor[];
  onStop: (taskId: string) => void;
}): ReactElement {
  const now = useTickingNow(true);
  return (
    <>
      {monitors.map((monitor) => (
        <MonitorRow key={monitor.taskId} monitor={monitor} now={now} onStop={onStop} />
      ))}
    </>
  );
}

function MonitorRow({
  monitor,
  now,
  onStop,
}: {
  monitor: AgentMonitor;
  now: number;
  onStop: (taskId: string) => void;
}): ReactElement {
  const isCompact = useIsCompactFormFactor();
  const name = monitor.description || monitor.taskId;
  const stop = useCallback(() => onStop(monitor.taskId), [monitor.taskId, onStop]);
  return (
    <ComposerTrackRow accessibilityLabel={name} testID={`groupon-agent-monitor-${monitor.taskId}`}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {name}
        </Text>
        {monitor.command ? (
          <Text style={styles.rowCommand} numberOfLines={1}>
            {monitor.command}
          </Text>
        ) : null}
        <Text style={styles.rowFacts} testID={`groupon-agent-monitor-left-${monitor.taskId}`}>
          {monitorTimeLeft(monitor, now)}
        </Text>
      </View>
      <ToolbarButton
        label={GROUPON_MONITORS.stop(name)}
        tooltip={STOP_TOOLTIP}
        tooltipSide="top"
        compact={isCompact}
        onPress={stop}
        testID={`groupon-agent-monitor-stop-${monitor.taskId}`}
      >
        <ThemedStop size={paneContentToolbarIconSize(isCompact)} uniProps={mutedColor} />
      </ToolbarButton>
    </ComposerTrackRow>
  );
}

const ThemedStop = withUnistyles(CircleStop);
const mutedColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const styles = StyleSheet.create((theme) => ({
  // Apart from Share and the people beside it: the watches are the agent's, not the room's.
  pill: { marginLeft: theme.spacing[2] },
  rowText: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", minWidth: 0, gap: 2 },
  rowTitle: { fontSize: theme.fontSize.base, color: theme.colors.foreground },
  rowCommand: {
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    color: theme.colors.foregroundMuted,
  },
  rowFacts: { fontSize: theme.fontSize.sm, color: theme.colors.foregroundMuted },
  tooltipText: { fontSize: theme.fontSize.sm, color: theme.colors.foreground },
}));

const STOP_TOOLTIP = <StopTooltip />;

function StopTooltip(): ReactElement {
  return <Text style={styles.tooltipText}>{GROUPON_MONITORS.stopTooltip}</Text>;
}
