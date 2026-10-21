// Added for Groupon Desk (fork of Paseo, Apache-2.0): what the sidebar's Connected computers shows, from the hub's Macs and their load samples.

/**
 * The model of the sidebar's Connected computers (owner, 2026-10-21; monorepo design section
 * 4b): each of the person's Macs, whether it is online, and its CPU and RAM. Pure, so the states
 * are tested without React.
 *
 * Responsibilities:
 * - the Macs from the same rows as Your Macs and New workspace's Mac picker (`yourMacRows`), this
 *   computer first, then those online, each group in Your Macs' order
 * - online: the Mac's hand sent a load sample within the last 60 s (it sends one every 10 s), or
 *   the window holds a live connection to its daemon (a hand older than the samples)
 * - the tools the Mac's hand cannot find (`missing-tools-model.ts`), as amber labels on the row and
 *   one sentence each on expanding
 * - the load shown on expanding: CPU and RAM in whole percents from a sample under 60 s old; an
 *   online Mac without one says so; an offline Mac says when it was last seen (Core marks a Mac
 *   seen on every sample too)
 *
 * Constraints:
 * - A sample read more recently than the shared hub list (the section's own 10 s read while a row
 *   is open) wins over the list's, by its `sampledAt`; nothing here reads the hub itself
 */

import type { HubMachineLoad } from "./hub";
import type { HubMachineView } from "./hub-sync";
import { missingToolFixes, shownMissingTools } from "./missing-tools-model";
import { GROUPON_COMPUTERS, type MissingTool } from "./strings";
import { seenAgo, uniqueMacViews, yourMacRows } from "./your-macs-model";

/** A Mac is online while its latest load sample is younger than this (the hand sends one every 10 s). */
export const COMPUTER_ONLINE_MS = 60_000;

export interface ComputerLoad {
  cpuPercent: number;
  memoryPercent: number;
  cpuText: string;
  memoryText: string;
}

export interface ConnectedComputerRow {
  /** The hub's machine id. */
  id: string;
  label: string;
  isThisComputer: boolean;
  online: boolean;
  /** CPU and RAM from a fresh sample; null when there is none. */
  load: ComputerLoad | null;
  /** The line shown on expanding instead of the bars; null when the bars show. */
  note: string | null;
  /** The tools its hand cannot find, for the amber labels ("gh missing"); `codex` only while a session on the Mac uses it. */
  missingTools: MissingTool[];
  /** One sentence per missing tool on how to install it, shown on expanding; empty when none is missing. */
  fixes: string[];
}

function ageMs(at: string, now: Date): number {
  const ms = now.getTime() - new Date(at).getTime();
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

/** The newer of two samples of one Mac, by `sampledAt`. */
function newerLoad(
  a: HubMachineLoad | null | undefined,
  b: HubMachineLoad | null | undefined,
): HubMachineLoad | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a.sampledAt.localeCompare(b.sampledAt) >= 0 ? a : b;
}

/** The line shown on expanding instead of the bars; null when the bars show. */
function noteOf(hasLoad: boolean, online: boolean, lastSeenAt: string, now: Date): string | null {
  if (hasLoad) return null;
  if (online) return GROUPON_COMPUTERS.noLoad;
  return GROUPON_COMPUTERS.seen(seenAgo(lastSeenAt, now));
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

export function connectedComputerRows({
  views,
  isOnline,
  now,
  freshLoads = new Map(),
  codexServerIds = new Set(),
}: {
  views: readonly HubMachineView[];
  isOnline: (serverId: string) => boolean;
  now: Date;
  /** Samples read since the shared list, by machine id. */
  freshLoads?: ReadonlyMap<string, HubMachineLoad>;
  /** The daemons a session using Codex runs on: `codex` is shown missing on those only. */
  codexServerIds?: ReadonlySet<string>;
}): ConnectedComputerRow[] {
  const viewOf = new Map(uniqueMacViews(views).map((view) => [view.machine.machine, view]));
  const rows = yourMacRows(views, isOnline).map((row): ConnectedComputerRow => {
    const view = viewOf.get(row.id);
    const machine = view?.machine;
    const sample = newerLoad(machine?.load, freshLoads.get(row.id));
    const fresh =
      sample !== null && ageMs(sample.sampledAt, now) < COMPUTER_ONLINE_MS ? sample : null;
    const online = fresh !== null || row.state === "connected";
    const load =
      fresh === null
        ? null
        : {
            cpuPercent: clampPercent(fresh.cpuPercent),
            memoryPercent: clampPercent(fresh.memoryPercent),
            cpuText: GROUPON_COMPUTERS.percent(clampPercent(fresh.cpuPercent)),
            memoryText: GROUPON_COMPUTERS.percent(clampPercent(fresh.memoryPercent)),
          };
    const missingTools = shownMissingTools(
      machine?.missingTools,
      view?.serverId ? codexServerIds.has(view.serverId) : false,
    );
    return {
      id: row.id,
      label: row.label,
      isThisComputer: row.isThisMac,
      online,
      load,
      note: noteOf(load !== null, online, row.lastSeenAt, now),
      missingTools,
      fixes: missingToolFixes(missingTools),
    };
  });
  const rank = (row: ConnectedComputerRow) => {
    if (row.isThisComputer) return 0;
    return row.online ? 1 : 2;
  };
  // A stable sort: within a rank, Your Macs' order stays.
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => rank(a.row) - rank(b.row) || a.index - b.index)
    .map(({ row }) => row);
}

/** The ids of the Macs open in the list, with `id` opened or closed. */
export function toggleExpanded(expanded: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(expanded);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
