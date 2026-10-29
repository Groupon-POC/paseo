// Added for Groupon Desk (fork of Paseo, Apache-2.0): "Connected computers" in the sidebar, above the subscriptions' limits.

/**
 * The sidebar's Connected computers (owner, 2026-10-21): the person's Macs, a green dot on those
 * online and the word "offline" after the others (owner, 2026-10-26), "This computer" on the Mac
 * the window runs on, under a collapsed online Mac a strip of
 * its load, and on pressing one the load card (WW-97, `computer-load-card.tsx`: uptime and load
 * average, CPU, RAM, download, upload with their histories, the disk). The rows come from the hub
 * list the Mac picker reads (`useHubMachinesStore`); the states are `connected-computers-model.ts`.
 *
 * Responsibilities:
 * - a clock every 10 s while the window is visible, so a Mac whose hand stopped goes grey
 * - while a Mac is open, its load read again every 10 s (`fetchMachines`, one GET, nothing
 *   opened or added): the shared list is read only every 30 s
 * - the last 60 samples of each Mac, in memory, from both reads (`machine-load-model.ts`)
 *
 * - a Mac whose hand cannot find a tool (`gh`, `git`, `claude`; `codex` only while a session on
 *   it uses Codex) carries small amber labels ("gh missing") and, on expanding, one sentence on how
 *   to install it (`missing-tools-model.ts`)
 *
 * - the heading folds this section to one line, "Connected computers · 3 online" (owner,
 *   2026-10-28); the subscriptions below fold on their own (owner, 2026-10-29), and each choice is
 *   kept on this device (`useGrouponPreferences().footerPanelCollapsed`)
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
import {
  COMPUTERS_REFRESH_MS,
  type ConnectedComputerRow,
  connectedComputerRows,
  toggleExpanded,
} from "./connected-computers-model";
import { useCodexServerIds } from "./codex-servers";
import { ComputerLoadCard, ComputerLoadStrip } from "./computer-load-card";
import { fetchMachines, type HubMachineLoad } from "./hub";
import { useHubMachinesStore, useOnlineServerIds } from "./hub-sync";
import { recordSamples } from "./machine-load-model";
import { MissingToolLabels } from "./missing-tool-labels";
import { useGrouponStore } from "./session";
import { useGrouponPreferences } from "./preferences";
import { onlineCounts } from "./sidebar-fold-model";
import { GROUPON_COMPUTERS } from "./strings";

const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);
const mutedColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const EXPANDED = { expanded: true } as const;
const NO_HISTORY: readonly HubMachineLoad[] = [];
const COLLAPSED = { expanded: false } as const;

export function ConnectedComputersSidebarSection() {
  const folded = useGrouponPreferences((state) => state.footerPanelCollapsed === true);
  const setFolded = useGrouponPreferences((state) => state.setFooterPanelCollapsed);
  const toggleFolded = useCallback(() => setFolded(!folded), [folded, setFolded]);
  const ready = useGrouponStore((state) => state.status === "ready");
  const visible = useAppVisible();
  const views = useHubMachinesStore((state) => state.machines);
  const [now, setNow] = useState(() => new Date());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [freshLoads, setFreshLoads] = useState<ReadonlyMap<string, HubMachineLoad>>(
    () => new Map(),
  );
  const [histories, setHistories] = useState<ReadonlyMap<string, readonly HubMachineLoad[]>>(
    () => new Map(),
  );

  // Every sample either read brings, once each: the card's bars.
  useEffect(() => {
    const samples: [string, HubMachineLoad][] = [];
    for (const view of views)
      if (view.machine.load) samples.push([view.machine.machine, view.machine.load]);
    for (const entry of freshLoads) samples.push(entry);
    samples.sort((a, b) => a[1].sampledAt.localeCompare(b[1].sampledAt));
    setHistories((current) => recordSamples(current, samples));
  }, [views, freshLoads]);

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

  const anyOpen = !folded && expanded.size > 0;
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
      <FoldHeading folded={folded} rows={rows} onPress={toggleFolded} />
      {folded
        ? null
        : rows.map((row) => (
            <ComputerRow
              key={row.id}
              row={row}
              open={expanded.has(row.id)}
              history={histories.get(row.id) ?? NO_HISTORY}
              onToggle={toggle}
            />
          ))}
    </View>
  );
}

/** The heading, which folds the section and the limits below it; folded, it counts the Macs online. */
function FoldHeading({
  folded,
  rows,
  onPress,
}: {
  folded: boolean;
  rows: readonly ConnectedComputerRow[];
  onPress: () => void;
}) {
  const { online, offline } = onlineCounts(rows);
  const Chevron = folded ? ThemedChevronRight : ThemedChevronDown;
  return (
    <PressHighlight
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={folded ? COLLAPSED : EXPANDED}
      accessibilityLabel={folded ? GROUPON_COMPUTERS.unfoldPanel : GROUPON_COMPUTERS.foldPanel}
      style={headingStyle}
      testID="sidebar-computers-fold"
    >
      <Text style={styles.heading} numberOfLines={1}>
        {GROUPON_COMPUTERS.heading}
      </Text>
      {folded ? (
        <Text style={styles.headingCount} numberOfLines={1} testID="sidebar-computers-count">
          {GROUPON_COMPUTERS.onlineCount(online, offline)}
        </Text>
      ) : null}
      <View style={styles.spacer} />
      <Chevron size={12} uniProps={mutedColor} />
    </PressHighlight>
  );
}

function headingStyle({ hovered }: PressableStateCallbackType & { hovered?: boolean }) {
  return hovered ? [styles.headingRow, styles.rowHovered] : styles.headingRow;
}

function ComputerRow({
  row,
  open,
  history,
  onToggle,
}: {
  row: ConnectedComputerRow;
  open: boolean;
  history: readonly HubMachineLoad[];
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
        {row.online ? null : (
          <Text
            style={styles.offline}
            numberOfLines={1}
            testID={`sidebar-computer-offline-${row.id}`}
          >
            {GROUPON_COMPUTERS.offline}
          </Text>
        )}
        <MissingToolLabels tools={row.missingTools} testID={`sidebar-computer-missing-${row.id}`} />
        <View style={styles.spacer} />
        <Chevron size={12} uniProps={mutedColor} />
      </PressHighlight>
      {!open && row.load ? (
        <ComputerLoadStrip load={row.load} testID={`sidebar-computer-strip-${row.id}`} />
      ) : null}
      {open ? <ComputerLoadLines row={row} history={history} /> : null}
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

function ComputerLoadLines({
  row,
  history,
}: {
  row: ConnectedComputerRow;
  history: readonly HubMachineLoad[];
}) {
  if (row.load === null) {
    return (
      <Text style={styles.note} testID={`sidebar-computer-note-${row.id}`}>
        {row.note}
      </Text>
    );
  }
  return (
    <ComputerLoadCard
      load={row.load}
      history={history}
      testID={`sidebar-computer-load-${row.id}`}
    />
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
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    minHeight: 24,
    marginTop: theme.spacing[1],
    paddingVertical: theme.spacing[0.5],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
  },
  heading: {
    flexShrink: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  headingCount: {
    flexShrink: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
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
  offline: {
    flexShrink: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
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
}));
