// Added for Groupon Desk (fork of Paseo, Apache-2.0): a Mac's load in Connected computers, the collapsed row's strip and the expanded card (WW-97).

/**
 * A Mac's load as Connected computers draws it (owner, 2026-10-22, after the Paseo plugin
 * host-monitor; its look is borrowed, in the window's own colours and type): a compact strip
 * under a collapsed Mac's name (CPU, RAM and disk in percent, the network down and up), and on
 * expanding a card: uptime and load average, CPU with its cores and a bar history, RAM in GB with
 * a history, download and upload with histories, the disk with a bar. The words are
 * `connected-computers-model.ts`'s, the history and the bars `machine-load-model.ts`'s.
 *
 * Constraints:
 * - Theme tokens only; a share above 80 percent is drawn in the warning colour (amber)
 * - A figure the hand does not send leaves its line out; nothing is drawn as 0 in its place
 */

import { ArrowDown, ArrowDownUp, ArrowUp, Cpu, HardDrive, MemoryStick } from "lucide-react-native";
import { type ReactNode, useMemo } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import { UsageMeter } from "@/usage/meter";
import type { ComputerLoad } from "./connected-computers-model";
import type { HubMachineLoad } from "./hub";
import { isHot, LOAD_HISTORY_LENGTH, percentBars, rateBars } from "./machine-load-model";
import { GROUPON_COMPUTERS } from "./strings";

const ICON_SIZE = 12;
const SPARK_HEIGHT = 18;

const ThemedCpu = withUnistyles(Cpu);
const ThemedMemory = withUnistyles(MemoryStick);
const ThemedDisk = withUnistyles(HardDrive);
const ThemedNetwork = withUnistyles(ArrowDownUp);
const ThemedDown = withUnistyles(ArrowDown);
const ThemedUp = withUnistyles(ArrowUp);
const mutedColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const hotColor = (theme: Theme) => ({ color: theme.colors.statusWarning });

const pickCpu = (sample: HubMachineLoad) => sample.cpuPercent;
const pickMemory = (sample: HubMachineLoad) => sample.memoryPercent;
const pickDown = (sample: HubMachineLoad) => sample.netRxBytesPerSecond;
const pickUp = (sample: HubMachineLoad) => sample.netTxBytesPerSecond;

/** Under a collapsed online Mac: CPU, RAM, disk and the network in one quiet line. */
export function ComputerLoadStrip({ load, testID }: { load: ComputerLoad; testID?: string }) {
  return (
    <View style={styles.strip} testID={testID}>
      <StripFigure Icon={ThemedCpu} percent={load.cpuPercent} text={load.cpuText} />
      <StripFigure Icon={ThemedMemory} percent={load.memoryPercent} text={load.memoryText} />
      {load.disk ? (
        <StripFigure Icon={ThemedDisk} percent={load.disk.percent} text={load.disk.text} />
      ) : null}
      {load.network ? (
        <View style={styles.stripFigure} accessibilityLabel={GROUPON_COMPUTERS.network}>
          <ThemedNetwork size={ICON_SIZE} uniProps={mutedColor} />
          <Text style={styles.stripText} numberOfLines={1}>
            {load.network.compactText}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function StripFigure({
  Icon,
  percent,
  text,
}: {
  Icon: typeof ThemedCpu;
  percent: number;
  text: string;
}) {
  const hot = isHot(percent);
  return (
    <View style={styles.stripFigure}>
      <Icon size={ICON_SIZE} uniProps={hot ? hotColor : mutedColor} />
      <Text style={hot ? styles.stripTextHot : styles.stripText} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/** Under an expanded online Mac: the card, with the history the window kept of it. */
export function ComputerLoadCard({
  load,
  history,
  testID,
}: {
  load: ComputerLoad;
  history: readonly HubMachineLoad[];
  testID?: string;
}) {
  const cpuBars = useMemo(() => percentBars(history, pickCpu), [history]);
  const memoryBars = useMemo(() => percentBars(history, pickMemory), [history]);
  const downBars = useMemo(() => rateBars(history, pickDown), [history]);
  const upBars = useMemo(() => rateBars(history, pickUp), [history]);
  return (
    <View style={styles.card} testID={testID}>
      {load.summary ? <Text style={styles.summary}>{load.summary}</Text> : null}
      <Metric
        Icon={ThemedCpu}
        label={load.cpuLabel}
        value={load.cpuText}
        hot={isHot(load.cpuPercent)}
      >
        <Sparkline values={cpuBars} tone={isHot(load.cpuPercent) ? "hot" : "muted"} />
      </Metric>
      <Metric
        Icon={ThemedMemory}
        label={load.memoryLabel}
        value={load.memoryText}
        hot={isHot(load.memoryPercent)}
      >
        <Sparkline values={memoryBars} tone={isHot(load.memoryPercent) ? "hot" : "muted"} />
      </Metric>
      {load.network ? (
        <Metric Icon={ThemedDown} label={GROUPON_COMPUTERS.download} value={load.network.downText}>
          <Sparkline values={downBars} tone="network" />
        </Metric>
      ) : null}
      {load.network ? (
        <Metric Icon={ThemedUp} label={GROUPON_COMPUTERS.upload} value={load.network.upText}>
          <Sparkline values={upBars} tone="network" />
        </Metric>
      ) : null}
      {load.disk ? (
        <Metric
          Icon={ThemedDisk}
          label={load.disk.label}
          value={load.disk.text}
          hot={isHot(load.disk.percent)}
        >
          <UsageMeter
            percent={load.disk.percent}
            tone={isHot(load.disk.percent) ? "warning" : "ok"}
            quiet={!isHot(load.disk.percent)}
            style={styles.diskMeter}
          />
        </Metric>
      ) : null}
    </View>
  );
}

function Metric({
  Icon,
  label,
  value,
  hot = false,
  children,
}: {
  Icon: typeof ThemedCpu;
  label: string;
  value: string;
  hot?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricHead}>
        <Icon size={ICON_SIZE} uniProps={hot ? hotColor : mutedColor} />
        <Text style={styles.metricLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={hot ? styles.metricValueHot : styles.metricValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {children}
    </View>
  );
}

type SparkTone = "muted" | "hot" | "network";

/** The history as thin bars, oldest left, right-aligned in `LOAD_HISTORY_LENGTH` slots so a bar keeps its width as the history grows. */
function Sparkline({ values, tone }: { values: readonly number[]; tone: SparkTone }) {
  const slots = useMemo(() => {
    const shown = values.slice(-LOAD_HISTORY_LENGTH);
    const empty = LOAD_HISTORY_LENGTH - shown.length;
    return Array.from({ length: LOAD_HISTORY_LENGTH }, (_, slot) => {
      const value = slot < empty ? null : (shown[slot - empty] ?? 0);
      return {
        id: `slot-${slot}`,
        style:
          value === null
            ? null
            : { height: Math.max(1, (Math.min(100, Math.max(0, value)) / 100) * SPARK_HEIGHT) },
      };
    });
  }, [values]);
  const barTone = sparkToneStyle(tone);
  return (
    <View style={styles.spark}>
      {slots.map((slot) => (
        <View key={slot.id} style={styles.sparkSlot}>
          {slot.style ? <View style={[styles.sparkBar, barTone, slot.style]} /> : null}
        </View>
      ))}
    </View>
  );
}

function sparkToneStyle(tone: SparkTone) {
  switch (tone) {
    case "hot":
      return styles.sparkHot;
    case "network":
      return styles.sparkNetwork;
    default:
      return styles.sparkMuted;
  }
}

const styles = StyleSheet.create((theme) => ({
  strip: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: theme.spacing[2],
    rowGap: 2,
    marginTop: theme.spacing[1.5],
    paddingLeft: theme.spacing[2] + 7 + theme.spacing[1.5],
    paddingRight: theme.spacing[2],
    paddingBottom: theme.spacing[1],
  },
  stripFigure: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  stripText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  stripTextHot: {
    color: theme.colors.statusWarning,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  card: {
    gap: theme.spacing[1.5],
    marginLeft: theme.spacing[2] + 7 + theme.spacing[1.5],
    marginRight: theme.spacing[2],
    marginTop: theme.spacing[1.5],
    marginBottom: theme.spacing[1.5],
    padding: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  summary: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  metric: {
    gap: 3,
  },
  metricHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
  },
  metricLabel: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  metricValue: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  metricValueHot: {
    color: theme.colors.statusWarning,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  spark: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: SPARK_HEIGHT,
  },
  sparkSlot: {
    flex: 1,
    height: "100%",
    justifyContent: "flex-end",
    paddingHorizontal: 0.5,
  },
  sparkBar: {
    width: "100%",
    opacity: 0.7,
  },
  sparkMuted: {
    backgroundColor: theme.colors.foregroundMuted,
  },
  sparkHot: {
    backgroundColor: theme.colors.statusWarning,
  },
  sparkNetwork: {
    backgroundColor: theme.colors.statusSuccess,
  },
  diskMeter: {
    height: 5,
    borderRadius: 3,
  },
}));
