// Changed for Groupon Desk (fork of Paseo, Apache-2.0): one row per account in the sidebar's usage summary, a greyed row with a tooltip for an account that reports no usage.
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
  type PressableStateCallbackType,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { builtinSidebarNavLabelKey } from "@/sidebar-nav/model";
import { useUsagePreferences } from "./display";
import { useUsageHostId } from "./hosts";
import { useUsageHostReports } from "./queries";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usageCopy } from "./copy";
import { UsageSourceIcon } from "./source-icon";
import { UsageMeter } from "./meter";
import {
  choosePinnedUsageLayout,
  METER_GAP,
  MIN_METER_WIDTH,
  resolvePinnedUsage,
  type PinnedUsageLayout,
  type PinnedUsageSource,
} from "./pinned";
import { UsageModal } from "./usage-modal";

/** Each summary window with data on the usage host, under its source; empty while none has. */
function useUsageSummary(): readonly PinnedUsageSource[] {
  const { preferences } = useUsagePreferences();
  const reports = useUsageHostReports(useUsageHostId());
  return useMemo(() => resolvePinnedUsage(reports, preferences), [preferences, reports]);
}

/** Whether the sidebar Usage item has anything to show. */
export function useHasUsageSummary(): boolean {
  return useUsageSummary().length > 0;
}

/**
 * The sidebar footer's usage entry: one row per account with its summary windows' percents (a
 * greyed row for one that reports no usage), and nothing while no account has a row, since the
 * footer's Usage icon already opens Usage. Pressing a row opens the Usage modal.
 */
export function UsageSidebarItem() {
  const { t } = useTranslation();
  const label = t(builtinSidebarNavLabelKey("usage"));
  const openUsage = useOpenSidebarUsage();
  const sources = useUsageSummary();
  if (sources.length === 0) return null;
  return <PinnedUsageTrigger label={label} sources={sources} onPress={openUsage} />;
}

const OpenSidebarUsageContext = createContext<(() => void) | null>(null);

/**
 * One owner for the footer icon and summary: both open the Usage modal over the current screen.
 * The modal mounts on first open and unmounts once it has finished closing, so its host's reports
 * load only while it is shown.
 */
export function UsageSidebarRoot({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const openUsage = useCallback(() => {
    setMounted(true);
    setOpen(true);
  }, []);
  const closeUsage = useCallback(() => setOpen(false), []);
  const unmountUsage = useCallback(() => setMounted(false), []);

  return (
    <OpenSidebarUsageContext.Provider value={openUsage}>
      {children}
      {mounted ? <UsageModal visible={open} onClose={closeUsage} onDismiss={unmountUsage} /> : null}
    </OpenSidebarUsageContext.Provider>
  );
}

/** Both sidebar entry points send the same open command. */
export function useOpenSidebarUsage(): () => void {
  const openUsage = useContext(OpenSidebarUsageContext);
  if (!openUsage) throw new Error("Sidebar Usage must be inside UsageSidebarRoot.");
  return openUsage;
}

function pinnedUsageLabel(label: string, source: PinnedUsageSource): string {
  const name = source.name ? ` ${source.name}` : "";
  if (source.muted) return `${label}${name}: ${source.hint ?? usageCopy.empty}`;
  return `${label}${name}: ${source.windows.map((window) => window.label).join(", ")}`;
}

function triggerStyle({ hovered }: PressableStateCallbackType & { hovered?: boolean }) {
  return hovered ? [styles.trigger, styles.triggerHovered] : styles.trigger;
}

function layoutWidth(event: LayoutChangeEvent): number {
  return event.nativeEvent.layout.width;
}

/**
 * One row per account: its mark, its short name, then per window a meter and "31% 5h", so every
 * account (every Groupon Desk subscription) is in reach without opening Usage. An account that
 * reports no usage is a greyed row with its reason in a tooltip. Off-screen copies measure the
 * widest row with labels and with percents alone; the richest layout that fits every row is
 * shown, and what it leaves out takes no space at all.
 */
function PinnedUsageTrigger({
  label,
  sources,
  onPress,
}: {
  label: string;
  sources: readonly PinnedUsageSource[];
  onPress: () => void;
}) {
  const [available, setAvailable] = useState<number | null>(null);
  const [labelsWidth, setLabelsWidth] = useState<number | null>(null);
  const [percentsWidth, setPercentsWidth] = useState<number | null>(null);
  const handleAvailableLayout = useCallback((event: LayoutChangeEvent) => {
    setAvailable(layoutWidth(event));
  }, []);
  const handleLabelsLayout = useCallback((event: LayoutChangeEvent) => {
    setLabelsWidth(layoutWidth(event));
  }, []);
  const handlePercentsLayout = useCallback((event: LayoutChangeEvent) => {
    setPercentsWidth(layoutWidth(event));
  }, []);
  const layout = choosePinnedUsageLayout({
    available,
    labelsWidth,
    percentsWidth,
    windowCount: sources.reduce((most, source) => Math.max(most, source.windows.length), 0),
  });
  return (
    <View style={styles.rows} testID="sidebar-usage">
      {sources.map((source, index) => (
        <PinnedUsageRow
          key={source.key}
          label={label}
          source={source}
          layout={layout}
          onPress={onPress}
          onLineLayout={index === 0 ? handleAvailableLayout : undefined}
        />
      ))}
      <View
        style={styles.measure}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
      >
        <View style={styles.measured} onLayout={handleLabelsLayout}>
          {sources.map((source) => (
            <View key={source.key} style={styles.measuredRow}>
              <PinnedUsageLine source={source} layout="labels" measuring />
            </View>
          ))}
        </View>
        <View style={styles.measured} onLayout={handlePercentsLayout}>
          {sources.map((source) => (
            <View key={source.key} style={styles.measuredRow}>
              <PinnedUsageLine source={source} layout="percents" measuring />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/** One account's row; a greyed one carries its reason in a tooltip (and in its accessible label). */
function PinnedUsageRow({
  label,
  source,
  layout,
  onPress,
  onLineLayout,
}: {
  label: string;
  source: PinnedUsageSource;
  layout: PinnedUsageLayout;
  onPress: () => void;
  onLineLayout?: (event: LayoutChangeEvent) => void;
}) {
  const row = (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={pinnedUsageLabel(label, source)}
      style={triggerStyle}
      testID="sidebar-usage-row"
    >
      <View style={[styles.line, source.muted ? styles.mutedLine : null]} onLayout={onLineLayout}>
        <PinnedUsageLine source={source} layout={layout} />
      </View>
    </Pressable>
  );
  if (!source.muted || !source.hint) return row;
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="top" align="start" offset={6} testID="sidebar-usage-hint">
        <Text style={styles.hint}>{source.hint}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * One row's items as direct children of one line, so every meter shares the leftover width
 * equally: the mark, the name in a slot of its own (so the windows of every row line up), then
 * the windows, or the reason of a greyed row.
 */
function PinnedUsageLine({
  source,
  layout,
  measuring = false,
}: {
  source: PinnedUsageSource;
  layout: PinnedUsageLayout;
  measuring?: boolean;
}) {
  return (
    <>
      <View testID={measuring ? undefined : "sidebar-usage-source"}>
        <UsageSourceIcon svg={source.icon} size={14} />
      </View>
      {source.name ? (
        <Text style={[styles.name, styles.iconGap]} numberOfLines={1}>
          {source.name}
        </Text>
      ) : null}
      {/* The reason shrinks into whatever the row leaves; it never sets the measured width. */}
      {source.muted && !measuring ? (
        <Text style={[styles.hintInline, styles.windowGap]} numberOfLines={1}>
          {source.hint ?? usageCopy.empty}
        </Text>
      ) : null}
      {source.windows.map((window, windowIndex) => {
        const leadStyle = windowIndex === 0 && !source.name ? styles.iconGap : styles.windowGap;
        return (
          <Fragment key={window.key}>
            {layout === "meters" ? (
              <View style={[styles.meterSlot, leadStyle]}>
                <UsageMeter
                  percent={window.percent}
                  tone={window.tone}
                  quiet
                  style={styles.meter}
                />
              </View>
            ) : null}
            <Text
              style={[styles.percent, layout === "meters" ? null : leadStyle]}
              numberOfLines={1}
              testID={measuring ? undefined : "sidebar-usage-pinned-window"}
            >
              {window.percentText}
              {layout === "percents" || window.shortLabel === "" ? null : (
                <Text style={styles.windowLabel}>{` ${window.shortLabel}`}</Text>
              )}
            </Text>
          </Fragment>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  rows: {
    width: "100%",
  },
  trigger: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    // The leading rail of Add project and the footer icons; rows tighter than one, so five fit.
    minHeight: 24,
    paddingVertical: theme.spacing[0.5],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
  },
  triggerHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  line: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  // Wide enough that nothing inside wraps or shrinks; each child reports its natural width.
  measure: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 10_000,
    opacity: 0,
  },
  // A column as wide as its widest row.
  measured: {
    alignSelf: "flex-start",
  },
  measuredRow: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
  },
  mutedLine: {
    opacity: 0.5,
  },
  // One width for every row's name, so the windows of all rows start in one column.
  name: {
    width: 72,
    flexShrink: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  hintInline: {
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  hint: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  iconGap: {
    marginLeft: theme.spacing[1.5],
  },
  windowGap: {
    marginLeft: theme.spacing[2],
  },
  // Every slot takes an equal share of the leftover width, so the line fills the row.
  meterSlot: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: MIN_METER_WIDTH,
    marginRight: METER_GAP,
  },
  meter: {
    height: 6,
    borderRadius: 3,
  },
  percent: {
    flexShrink: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  windowLabel: {
    color: theme.colors.foregroundMuted,
  },
}));
