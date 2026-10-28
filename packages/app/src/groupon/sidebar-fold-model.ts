// Added for Groupon Desk (fork of Paseo, Apache-2.0): the folded sidebar's two lines.

/**
 * What the sidebar's Connected computers and limits say when folded to two lines (owner,
 * 2026-10-28): the first line counts the Macs online and offline, the second names each account
 * with its fullest limit ("info3 85%"), the one that runs out first.
 */

import type { PinnedUsageSource } from "@/usage/pinned";

export function onlineCounts(rows: readonly { online: boolean }[]): {
  online: number;
  offline: number;
} {
  const online = rows.filter((row) => row.online).length;
  return { online, offline: rows.length - online };
}

/** "zarubto 62% · zaruba 90% · info 100%": accounts that report nothing are left out. */
export function foldedUsageLine(sources: readonly PinnedUsageSource[]): string {
  return sources
    .filter((source) => !source.muted && source.windows.length > 0)
    .map((source) => {
      const fullest = Math.max(...source.windows.map((window) => window.percent));
      return `${source.name ?? "account"} ${Math.round(fullest)}%`;
    })
    .join(" · ");
}
