// Changed for Groupon Desk (fork of Paseo, Apache-2.0): one sidebar row per account, with a short name, and accounts that cannot report usage kept as greyed rows with the reason. A source that never reported (Cursor without a working sign-in) is left out (`isShownUsageReport`).
import { isShownUsageReport } from "@/groupon/usage-health";
import type { TFunction } from "i18next";
import { i18n } from "@/i18n/i18next";
import { usageCopy } from "./copy";
import { formatPct, formatDisplayPct, formatProviderUsageLabel } from "./format";
import { displayPercent } from "./model";
import { effectiveUsagePins, type UsagePreferences } from "./preferences";
import { windowTone } from "./tone";
import type { UsageReportEntry, UsageTone } from "./types";

/** One summary window of one account, as the sidebar Usage item shows it. */
export interface PinnedUsageWindow {
  key: string;
  /** Accessible description, including the source, account, window and percent meaning. */
  label: string;
  /** The window's short name ("5h"), empty for none, or its label when the source sends none. */
  shortLabel: string;
  /** The share shown, under the user's used/remaining preference. */
  percent: number;
  percentText: string;
  tone: UsageTone;
}

/** One account's summary windows, under its source's icon. */
export interface PinnedUsageSource {
  key: string;
  icon: string | null;
  /** A short name for the account ("tomas" for tomas@example.com); null when its report names none. */
  name: string | null;
  /** The account reports no usage now (a lost sign-in, an error): shown greyed, `hint` says why. */
  muted: boolean;
  hint: string | null;
  windows: PinnedUsageWindow[];
}

/** How much of each window the one-line summary has room for. */
export type PinnedUsageLayout = "meters" | "labels" | "percents";

// A meter narrower than this is a sliver that reads as noise rather than a share.
export const MIN_METER_WIDTH = 16;
/** The space between a meter and its text. */
export const METER_GAP = 4;

/**
 * The richest layout that fits on one line: every window's meter, else its short label, else its
 * percent alone. Meters are all or none; a line never mixes them. Until the widths are known it
 * shows labels, which never flashes meters that turn out not to fit.
 */
export function choosePinnedUsageLayout(input: {
  available: number | null;
  labelsWidth: number | null;
  percentsWidth: number | null;
  windowCount: number;
}): PinnedUsageLayout {
  const { available, labelsWidth, percentsWidth, windowCount } = input;
  if (available === null || labelsWidth === null || percentsWidth === null) return "labels";
  if (labelsWidth + windowCount * (MIN_METER_WIDTH + METER_GAP) <= available) return "meters";
  if (labelsWidth <= available) return "labels";
  return percentsWidth < labelsWidth ? "percents" : "labels";
}

const EMAIL = /[^\s()<>·@]+@[^\s()<>·]+/;

/**
 * A short name for an account line: the local part of the first email in it ("Claude · tomas@x.com
 * (Max)" is "tomas"), else the part after a leading "<source> · " without a trailing "(plan)".
 */
export function shortAccountName(label: string | undefined): string | null {
  const text = label?.trim() ?? "";
  if (text.length === 0) return null;
  const email = EMAIL.exec(text)?.[0];
  if (email) return email.slice(0, email.indexOf("@"));
  const parts = text.split(" · ");
  const name =
    (parts.length > 1 ? parts[1] : parts[0])?.replace(/\s*\([^)]*\)\s*$/, "").trim() ?? "";
  return name.length > 0 ? name : null;
}

/** Why an account reports no usage, in the Usage page's words. */
function hintOf(entry: UsageReportEntry, t: TFunction): string | null {
  if (entry.report.status === "unavailable")
    return usageCopy.problem(entry.report.problem, new Date(), t);
  if (entry.report.status === "error") return entry.report.error;
  return null;
}

function describe(entry: UsageReportEntry, windowLabel: string): string {
  const account = entry.account.label ? ` (${entry.account.label})` : "";
  return `${entry.sourceLabel}${account} ${windowLabel}`;
}

/** Reports with every account of a source together, sources in the order they first appear. */
function groupBySource(reports: readonly UsageReportEntry[]): UsageReportEntry[] {
  const sourceIds = [...new Set(reports.map((entry) => entry.sourceId))];
  return sourceIds.flatMap((sourceId) => reports.filter((entry) => entry.sourceId === sourceId));
}

/**
 * The sidebar Usage item's summary: one group per account, grouped by source, each with its
 * windows in its report's order. An account whose pins show nothing is left out; one that reports
 * no usage stays, greyed, beside the accounts that do, so every account is reachable from the
 * sidebar. With no account showing a window there is no summary at all: the footer's Usage icon
 * already opens Usage.
 */
export function resolvePinnedUsage(
  reports: readonly UsageReportEntry[],
  preferences: UsagePreferences,
  t: TFunction = i18n.t,
): PinnedUsageSource[] {
  const pins = effectiveUsagePins(preferences, reports);
  const rows = groupBySource(reports.filter(isShownUsageReport)).flatMap(
    (entry): PinnedUsageSource[] => {
      const name = shortAccountName(entry.account.label);
      if (entry.report.status !== "available")
        return [
          {
            key: entry.id,
            icon: entry.icon ?? null,
            name,
            muted: true,
            hint: hintOf(entry, t),
            windows: [],
          },
        ];
      const windows = entry.report.windows
        .filter(
          (window) =>
            displayPercent(window, preferences.displayAs) !== null &&
            pins.some((pin) => pin.sourceId === entry.sourceId && pin.windowId === window.id),
        )
        .map((window) => {
          const percent = displayPercent(window, preferences.displayAs) ?? 0;
          const percentText = formatPct(percent);
          return {
            key: `${entry.id}/${window.id}`,
            label: `${describe(entry, formatProviderUsageLabel(window.id, window.label, t))} ${formatDisplayPct(percent, preferences.displayAs, undefined, t)}`,
            shortLabel: window.shortLabel ?? formatProviderUsageLabel(window.id, window.label, t),
            percent,
            percentText,
            tone: windowTone(window),
          };
        });
      if (windows.length === 0) return [];
      return [{ key: entry.id, icon: entry.icon ?? null, name, muted: false, hint: null, windows }];
    },
  );
  return rows.some((row) => !row.muted) ? rows : [];
}
