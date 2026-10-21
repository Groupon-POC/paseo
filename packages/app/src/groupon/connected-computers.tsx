// Added for Groupon Desk (fork of Paseo, Apache-2.0): "Connected computers" in the sidebar, above the subscriptions' limits.

/**
 * The sidebar's Connected computers (owner, 2026-10-21): the person's Macs, a green dot on those
 * online, "This computer" on the Mac the window runs on, and on pressing one its CPU and RAM as
 * bars in the limits panel's style. The rows come from the hub list the Mac picker reads
 * (`useHubMachinesStore`); the states are `connected-computers-model.ts`.
 *
 * Responsibilities:
 * - a clock every 10 s while the window is visible, so a Mac whose hand stopped goes grey
 * - while a Mac is open, its load read again every 10 s (`fetchMachines`, one GET, nothing
 *   opened or added): the shared list is read only every 30 s
 *
 * - a Mac whose hand cannot find a tool (`gh`, `git`, `claude`; `codex` only while a session on
 *   it uses Codex) carries small amber labels ("gh missing") and, on expanding, one sentence on how
 *   to install it (`missing-tools-model.ts`)
 *
 * Constraints:
 * - Nothing at all while the person is signed out or the hub knows no Mac of theirs
 */

import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type PressableStateCallbackType, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { PressHighlight } from "@/components/ui/press-highlight";
import { useAppVisible } from "@/hooks/use-app-visible";
import type { Theme } from "@/styles/theme";
import { UsageMeter } from "@/usage/meter";
import {
  type ConnectedComputerRow,
  connectedComputerRows,
  toggleExpanded,
} from "./connected-computers-model";
import { useCodexServerIds } from "./codex-servers";
import { fetchMachines, type HubMachineLoad } from "./hub";
import { useHubMachinesStore, useOnlineServerIds } from "./hub-sync";
import { MissingToolLabels } from "./missing-tool-labels";
import { useGrouponStore } from "./session";
import { GROUPON_COMPUTERS } from "./strings";

/** How often the clock ticks and an open Mac's load is read again: the hand's own interval. */
export const COMPUTERS_REFRESH_MS = 10_000;

const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);
const mutedColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const EXPANDED = { expanded: true } as const;
const COLLAPSED = { expanded: false } as const;

export function ConnectedComputersSidebarSection() {
  const ready = useGrouponStore((state) => state.status === "ready");
  const visible = useAppVisible();
  const views = useHubMachinesStore((state) => state.machines);
  const [now, setNow] = useState(() => new Date());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [freshLoads, setFreshLoads] = useState<ReadonlyMap<string, HubMachineLoad>>(
    () => new Map(),
  );

  const serverIds = useMemo(
    () => views.flatMap((view) => (view.serverId ? [view.serverId] : [])),
    [views],
  );
  const online = useOnlineServerIds(serverIds);
  const codexServerIds = useCodexServerIds();
  const rows = useMemo(() => {
    const onlineIds = new Set(online.split(",").filter(Boolean));
    return connectedComputerRows({
      views,
      isOnline: (serverId) => onlineIds.has(serverId),
      now,
      freshLoads,
      codexServerIds,
    });
  }, [views, online, now, freshLoads, codexServerIds]);

  const anyOpen = expanded.size > 0;
  useEffect(() => {
    if (!ready || !visible) return;
    let cancelled = false;
    const readLoads = async () => {
      try {
        const { machines } = await fetchMachines();
        if (cancelled) return;
        const loads = new Map<string, HubMachineLoad>();
        for (const machine of machines) if (machine.load) loads.set(machine.machine, machine.load);
        setFreshLoads(loads);
      } catch {
        // The hub is out of reach for now: the bars keep the last reading until it goes stale.
      }
    };
    const tick = () => {
      setNow(new Date());
      if (anyOpen) void readLoads();
    };
    tick();
    const timer = setInterval(tick, COMPUTERS_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [ready, visible, anyOpen]);

  const toggle = useCallback(
    (id: string) => setExpanded((current) => toggleExpanded(current, id)),
    [],
  );

  if (!ready || rows.length === 0) return null;
  return (
    <View style={styles.section} testID="sidebar-connected-computers">
      <Text style={styles.heading}>{GROUPON_COMPUTERS.heading}</Text>
      {rows.map((row) => (
        <ComputerRow key={row.id} row={row} open={expanded.has(row.id)} onToggle={toggle} />
      ))}
    </View>
  );
}

function ComputerRow({
  row,
  open,
  onToggle,
}: {
  row: ConnectedComputerRow;
  open: boolean;
  onToggle: (id: string) => void;
}) {
  const press = useCallback(() => onToggle(row.id), [onToggle, row.id]);
  const Chevron = open ? ThemedChevronDown : ThemedChevronRight;
  return (
    <View>
      <PressHighlight
        onPress={press}
        accessibilityRole="button"
        accessibilityState={open ? EXPANDED : COLLAPSED}
        accessibilityLabel={
          open ? GROUPON_COMPUTERS.collapse(row.label) : GROUPON_COMPUTERS.expand(row.label)
        }
        style={rowStyle}
        testID={`sidebar-computer-${row.id}`}
      >
        <View
          style={[styles.dot, row.online ? styles.dotOnline : styles.dotOffline]}
          accessibilityLabel={row.online ? GROUPON_COMPUTERS.online : GROUPON_COMPUTERS.offline}
          testID={row.online ? "sidebar-computer-online" : "sidebar-computer-offline"}
        />
        <Text style={[styles.name, row.online ? null : styles.nameOffline]} numberOfLines={1}>
          {row.label}
        </Text>
        {row.isThisComputer ? (
          <Text style={styles.badge} numberOfLines={1} testID="sidebar-computer-this">
            {GROUPON_COMPUTERS.thisComputer}
          </Text>
        ) : null}
        <MissingToolLabels tools={row.missingTools} testID={`sidebar-computer-missing-${row.id}`} />
        <View style={styles.spacer} />
        <Chevron size={12} uniProps={mutedColor} />
      </PressHighlight>
      {open ? <ComputerLoadLines row={row} /> : null}
      {open ? <ComputerFixLines row={row} /> : null}
    </View>
  );
}

/** On expanding a Mac whose hand cannot find a tool: one sentence per tool on how to install it. */
function ComputerFixLines({ row }: { row: ConnectedComputerRow }) {
  if (row.fixes.length === 0) return null;
  return (
    <View testID={`sidebar-computer-fix-${row.id}`}>
      {row.fixes.map((fix) => (
        <Text key={fix} style={styles.note}>
          {fix}
        </Text>
      ))}
    </View>
  );
}

function ComputerLoadLines({ row }: { row: ConnectedComputerRow }) {
  if (row.load === null) {
    return (
      <Text style={styles.note} testID={`sidebar-computer-note-${row.id}`}>
        {row.note}
      </Text>
    );
  }
  return (
    <View style={styles.loadLines} testID={`sidebar-computer-load-${row.id}`}>
      <LoadLine
        label={GROUPON_COMPUTERS.cpu}
        percent={row.load.cpuPercent}
        text={row.load.cpuText}
      />
      <LoadLine
        label={GROUPON_COMPUTERS.memory}
        percent={row.load.memoryPercent}
        text={row.load.memoryText}
      />
    </View>
  );
}

/** One figure as the limits panel draws one window: a quiet bar sharing the line, then the percent. */
function LoadLine({ label, percent, text }: { label: string; percent: number; text: string }) {
  return (
    <View style={styles.loadLine}>
      <Text style={styles.loadLabel}>{label}</Text>
      <View style={styles.meterSlot}>
        <UsageMeter percent={percent} tone="ok" quiet style={styles.meter} />
      </View>
      <Text style={styles.percent}>{text}</Text>
    </View>
  );
}

function rowStyle({ hovered }: PressableStateCallbackType & { hovered?: boolean }) {
  return hovered ? [styles.row, styles.rowHovered] : styles.row;
}

const styles = StyleSheet.create((theme) => ({
  section: {
    gap: 2,
    paddingHorizontal: theme.spacing[2],
    paddingBottom: theme.spacing[1.5],
  },
  heading: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    paddingHorizontal: theme.spacing[2],
    paddingTop: theme.spacing[2],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    minHeight: 24,
    paddingVertical: theme.spacing[0.5],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
  },
  rowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  dotOnline: {
    backgroundColor: theme.colors.success,
  },
  dotOffline: {
    backgroundColor: theme.colors.surface4,
  },
  name: {
    flexShrink: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  nameOffline: {
    color: theme.colors.foregroundMuted,
  },
  // The same green label as New workspace's Mac picker (WW-85).
  badge: {
    flexShrink: 0,
    color: theme.colors.success,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  spacer: {
    flex: 1,
  },
  note: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    paddingLeft: theme.spacing[2] + 7 + theme.spacing[1.5],
    paddingRight: theme.spacing[2],
    paddingBottom: theme.spacing[1],
  },
  loadLines: {
    gap: 2,
    paddingLeft: theme.spacing[2] + 7 + theme.spacing[1.5],
    paddingRight: theme.spacing[2],
    paddingBottom: theme.spacing[1],
  },
  loadLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  loadLabel: {
    width: 32,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  meterSlot: {
    flex: 1,
    minWidth: 0,
  },
  meter: {
    height: 6,
    borderRadius: 3,
  },
  percent: {
    minWidth: 36,
    textAlign: "right",
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
}));
