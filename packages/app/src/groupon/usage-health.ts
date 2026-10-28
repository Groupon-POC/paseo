// Added for Groupon Desk (fork of Paseo, Apache-2.0): which usage sources the window shows, and the sidebar icon's colour from how full the limits are.

import type { UsageReportEntry, UsageWindow } from "@/usage/types";

// Claude subscriptions stay as a greyed row when they report nothing; any other source shows once it has reported.
const ALWAYS_SHOWN_SOURCES = new Set(["groupon-subscriptions", "claude"]);

export function isShownUsageReport(
  entry: Pick<UsageReportEntry, "sourceId" | "report" | "lastSuccessful">,
): boolean {
  return (
    entry.report.status === "available" ||
    entry.lastSuccessful != null ||
    ALWAYS_SHOWN_SOURCES.has(entry.sourceId)
  );
}

// Read here rather than from `@/usage/model`, which imports this file.
function usedPercent(window: UsageWindow): number | null {
  if (window.usedPct != null) return window.usedPct;
  return window.remainingPct != null ? 100 - window.remainingPct : null;
}

// The Groupon plugin marks the subscription Desk signs in with now in its account line.
const SUBSCRIPTIONS_SOURCE = "groupon-subscriptions";
const IN_USE_MARK = "also the default Claude sign-in";

/** Of the Claude subscriptions, only the one in use now when one is marked; every other source as it is. */
export function inUseUsageReports<T extends Pick<UsageReportEntry, "sourceId" | "account">>(
  reports: readonly T[],
): T[] {
  const inUse = reports.filter(
    (entry) =>
      entry.sourceId === SUBSCRIPTIONS_SOURCE && entry.account.label?.includes(IN_USE_MARK),
  );
  if (inUse.length === 0) return [...reports];
  return reports.filter(
    (entry) => entry.sourceId !== SUBSCRIPTIONS_SOURCE || inUse.includes(entry),
  );
}

/** The fullest limit across the sources that report, in percent used; null when none reports. */
export function fullestUsagePercent(reports: readonly UsageReportEntry[]): number | null {
  let fullest: number | null = null;
  for (const entry of reports) {
    if (entry.report.status !== "available") continue;
    for (const window of entry.report.windows) {
      const used = usedPercent(window);
      if (used !== null && (fullest === null || used > fullest)) fullest = used;
    }
  }
  return fullest;
}

export type UsageHealthColor = "statusDotSuccess" | "statusDotWarning" | "statusDotDanger";

export function usageHealthColor(fullest: number | null): UsageHealthColor | null {
  if (fullest === null) return null;
  if (fullest >= 90) return "statusDotDanger";
  if (fullest >= 60) return "statusDotWarning";
  return "statusDotSuccess";
}
