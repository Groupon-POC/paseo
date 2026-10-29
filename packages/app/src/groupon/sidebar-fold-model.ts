// Added for Groupon Desk (fork of Paseo, Apache-2.0): the folded sidebar's two lines.

/**
 * What the sidebar's Connected computers and limits say when folded to two lines (owner,
 * 2026-10-28): the computers' line counts the Macs online and offline; the subscriptions' line names
 * each account with its fullest limit ("info3 85%"), the one that runs out first.
 */

import type { PinnedUsageSource } from "@/usage/pinned";

export function onlineCounts(rows: readonly { online: boolean }[]): {
  online: number;
  offline: number;
} {
  const online = rows.filter((row) => row.online).length;
  return { online, offline: rows.length - online };
}

/** "zarubto 62% · zaruba 90% · c_tzaruba –": every account, its fullest limit, a dash for one that reports none. */
export function foldedUsageLine(sources: readonly PinnedUsageSource[]): string {
  return sources
    .map((source) => {
      const name = source.name ?? "account";
      if (source.muted || source.windows.length === 0) return `${name} –`;
      return `${name} ${Math.round(Math.max(...source.windows.map((window) => window.percent)))}%`;
    })
    .join(" · ");
}
