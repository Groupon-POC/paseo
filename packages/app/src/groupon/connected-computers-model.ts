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
 * - the load from a sample under 60 s old (WW-97): the collapsed row's strip (CPU, RAM, disk in
 *   percent, the network's speed down and up) and the expanded card's lines (uptime and load
 *   average, CPU with its cores, RAM and disk in bytes, download and upload); a figure an older
 *   hand does not send is left out, never shown as 0. An online Mac without a sample says so; an
 *   offline Mac says when it was last seen (Core marks a Mac seen on every sample too)
 *
 * - `computerOffline`: the same rule for one daemon, so a workspace row's computer says "offline"
 *   exactly when its row here does (owner, 2026-10-26; `computer-presence.ts`)
 *
 * Constraints:
 * - A sample read more recently than the shared hub list (the section's own 10 s read while a row
 *   is open) wins over the list's, by its `sampledAt`; nothing here reads the hub itself
 */

import type { HubMachineLoad } from "./hub";
import type { HubMachineView } from "./hub-sync";
import {
  formatBytes,
  formatCompactRate,
  formatLoadAverage,
  formatPercent,
  formatRate,
  formatUptime,
  shareOf,
} from "./machine-load-model";
import { missingToolFixes, shownMissingTools } from "./missing-tools-model";
import { GROUPON_COMPUTERS, type MissingTool } from "./strings";
import { seenAgo, uniqueMacViews, yourMacRows } from "./your-macs-model";

/** How often the sidebar's clock ticks and an open Mac's load is read again: the hand's own interval. */
export const COMPUTERS_REFRESH_MS = 10_000;

/** A Mac is online while its latest load sample is younger than this (the hand sends one every 10 s). */
export const COMPUTER_ONLINE_MS = 60_000;

export interface ComputerLoad {
  cpuPercent: number;
  memoryPercent: number;
  cpuText: string;
  memoryText: string;
  /** "CPU · 8 cores"; "CPU" from a hand that sends no core count. */
  cpuLabel: string;
  /** "RAM · 3.8 GB / 15.1 GB"; "RAM" from a hand that sends no bytes. */
  memoryLabel: string;
  /** "up 3d 19h · load 4.51 3.26 2.24", either half alone; null when the hand sends neither. */
  summary: string | null;
  /** The root volume; null when the hand sends none. */
  disk: { percent: number; text: string; label: string } | null;
  /** The network's speed; null when the hand sends none. */
  network: { downText: string; upText: string; compactText: string } | null;
}

/** A fresh sample in words, for the strip and the card. */
export function computerLoadOf(sample: HubMachineLoad): ComputerLoad {
  const cpuPercent = Math.min(100, Math.max(0, sample.cpuPercent));
  const memoryPercent = Math.min(100, Math.max(0, sample.memoryPercent));
  const memoryBytes =
    sample.memoryUsedBytes != null && sample.memoryTotalBytes != null
      ? GROUPON_COMPUTERS.amountOf(
          formatBytes(sample.memoryUsedBytes, 1024),
          formatBytes(sample.memoryTotalBytes, 1024),
        )
      : null;
  const diskPercent = shareOf(sample.diskUsedBytes, sample.diskTotalBytes);
  const uptime = sample.uptimeSeconds != null ? formatUptime(sample.uptimeSeconds) : null;
  const averages = formatLoadAverage(sample.loadAverage);
  const summaryParts = [
    uptime === null ? null : GROUPON_COMPUTERS.up(uptime),
    averages === null ? null : GROUPON_COMPUTERS.loadAverage(averages),
  ].filter((part): part is string => part !== null);
  const down = sample.netRxBytesPerSecond;
  const up = sample.netTxBytesPerSecond;
  return {
    cpuPercent,
    memoryPercent,
    cpuText: formatPercent(cpuPercent),
    memoryText: formatPercent(memoryPercent),
    cpuLabel:
      sample.cores != null && sample.cores > 0
        ? GROUPON_COMPUTERS.cpuCores(sample.cores)
        : GROUPON_COMPUTERS.cpu,
    memoryLabel:
      memoryBytes === null ? GROUPON_COMPUTERS.memory : GROUPON_COMPUTERS.memoryOf(memoryBytes),
    summary: summaryParts.length === 0 ? null : summaryParts.join(" · "),
    disk:
      diskPercent === null || sample.diskUsedBytes == null || sample.diskTotalBytes == null
        ? null
        : {
            percent: diskPercent,
            text: formatPercent(diskPercent),
            label: GROUPON_COMPUTERS.diskOf(
              GROUPON_COMPUTERS.amountOf(
                formatBytes(sample.diskUsedBytes, 1000),
                formatBytes(sample.diskTotalBytes, 1000),
              ),
            ),
          },
    network:
      down == null || up == null
        ? null
        : {
            downText: formatRate(down),
            upText: formatRate(up),
            compactText: `${formatCompactRate(down)}/${formatCompactRate(up)}`,
          },
  };
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

/** The sample when it is under `COMPUTER_ONLINE_MS` old; null otherwise. */
function freshSample(sample: HubMachineLoad | null, now: Date): HubMachineLoad | null {
  return sample !== null && ageMs(sample.sampledAt, now) < COMPUTER_ONLINE_MS ? sample : null;
}

/**
 * Online: the Mac's hand sent a load sample within the last 60 s, or the window holds a live
 * connection to its daemon (a hand older than the samples).
 */
export function isComputerOnline(
  sample: HubMachineLoad | null | undefined,
  connected: boolean,
  now: Date,
): boolean {
  return connected || freshSample(sample ?? null, now) !== null;
}

/**
 * True when the daemon `serverId` belongs to one of the person's Macs and that Mac is offline by
 * `isComputerOnline`; false for an online one and for a daemon the hub does not know (nothing to say).
 */
export function computerOffline({
  views,
  serverId,
  connected,
  now,
}: {
  views: readonly HubMachineView[];
  serverId: string;
  connected: boolean;
  now: Date;
}): boolean {
  const view = uniqueMacViews(views).find((candidate) => candidate.serverId === serverId);
  return view !== undefined && !isComputerOnline(view.machine.load, connected, now);
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
    const fresh = freshSample(sample, now);
    const online = isComputerOnline(sample, row.state === "connected", now);
    const load = fresh === null ? null : computerLoadOf(fresh);
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
