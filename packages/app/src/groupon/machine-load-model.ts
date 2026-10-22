// Added for Groupon Desk (fork of Paseo, Apache-2.0): a Mac's load history and its figures in words, for Connected computers' card (WW-97).

/**
 * The figures of a Mac's load card, in words, and the short history the window keeps of each
 * Mac (owner, 2026-10-22, after the Paseo plugin host-monitor of `a31521424/paseo-kit`; the idea
 * of the card is borrowed, the code is the fork's own). Pure, so the wording is tested without React.
 *
 * Responsibilities:
 * - the history: the last `LOAD_HISTORY_LENGTH` samples of one Mac, oldest first, a sample taken
 *   once by its `sampledAt` (the list's 30 s read and the open Mac's 10 s read see the same one)
 * - the bars of a history: shares as they are (0 to 100), speeds scaled to the window's peak
 * - the wording: percents (one decimal below 10, so an idle Mac does not read 0%), memory in
 *   binary units as macOS's Activity Monitor counts it, disk and network in decimal units as the
 *   Finder and the network count them, uptime ("3d 19h") and load average ("4.51 3.26 2.24")
 * - amber: a share above `LOAD_HOT_PERCENT`
 *
 * Constraints:
 * - Memory only: nothing is stored, a history starts again with the window
 */

import type { HubMachineLoad } from "./hub";

/** Samples kept per Mac: ten minutes at the hand's 10 s. */
export const LOAD_HISTORY_LENGTH = 60;

/** A share above this is drawn in the warning colour. */
export const LOAD_HOT_PERCENT = 80;

/** Below this many bytes a second the network's bars stay low: idle chatter is not drawn as a full bar. */
const RATE_FLOOR_BYTES_PER_SECOND = 1_000;

export function isHot(percent: number): boolean {
  return percent > LOAD_HOT_PERCENT;
}

/** `history` with `sample` added when it is newer than the last one, kept to `limit`; the same array when nothing changed. */
export function appendSample(
  history: readonly HubMachineLoad[],
  sample: HubMachineLoad,
  limit = LOAD_HISTORY_LENGTH,
): readonly HubMachineLoad[] {
  const last = history.at(-1);
  if (last && sample.sampledAt.localeCompare(last.sampledAt) <= 0) return history;
  const next = [...history, sample];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

/** Every Mac's history with the samples just read; the same map when none of them was new. */
export function recordSamples(
  histories: ReadonlyMap<string, readonly HubMachineLoad[]>,
  samples: Iterable<readonly [string, HubMachineLoad]>,
): ReadonlyMap<string, readonly HubMachineLoad[]> {
  let next: Map<string, readonly HubMachineLoad[]> | null = null;
  for (const [id, sample] of samples) {
    const before = (next ?? histories).get(id) ?? [];
    const after = appendSample(before, sample);
    if (after === before) continue;
    next ??= new Map(histories);
    next.set(id, after);
  }
  return next ?? histories;
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

/** A share's bars, 0 to 100, oldest first. */
export function percentBars(
  history: readonly HubMachineLoad[],
  pick: (sample: HubMachineLoad) => number,
): number[] {
  return history.map((sample) => clampPercent(pick(sample)));
}

/** A speed's bars, 0 to 100 of the highest in the history (never below 1 KB/s); a sample without the speed is 0. */
export function rateBars(
  history: readonly HubMachineLoad[],
  pick: (sample: HubMachineLoad) => number | null | undefined,
): number[] {
  const values = history.map((sample) => Math.max(0, pick(sample) ?? 0));
  const peak = Math.max(RATE_FLOOR_BYTES_PER_SECOND, ...values);
  return values.map((value) => (value / peak) * 100);
}

/** "0%", "1.8%", "25%": one decimal below 10. */
export function formatPercent(percent: number): string {
  const value = clampPercent(Number.isFinite(percent) ? percent : 0);
  if (value < 0.05) return "0%";
  if (value < 9.95) return `${value.toFixed(1)}%`;
  return `${Math.round(value)}%`;
}

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

/** "3.8 GB": `base` 1024 for memory (as Activity Monitor), 1000 for disk and network (as the Finder). */
export function formatBytes(bytes: number, base: 1000 | 1024): string {
  let value = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  let unit = 0;
  // 999.95 would print "1000.0": move up a unit before the rounding gets there.
  while (value >= base - base * 0.00005 && unit < UNITS.length - 1) {
    value /= base;
    unit += 1;
  }
  return unit === 0 ? `${Math.round(value)} B` : `${value.toFixed(1)} ${UNITS[unit]}`;
}

/** "45.8 KB/s". */
export function formatRate(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond, 1000)}/s`;
}

/** "46K", "1.2M", "512": at most four characters, for the collapsed row's strip. */
export function formatCompactRate(bytesPerSecond: number): string {
  let value = Math.max(0, Number.isFinite(bytesPerSecond) ? bytesPerSecond : 0);
  if (value < 999.5) return `${Math.round(value)}`;
  for (const unit of ["K", "M", "G", "T"]) {
    value /= 1000;
    if (value < 9.95) return `${value.toFixed(1)}${unit}`;
    if (value < 999.5 || unit === "T") return `${Math.round(value)}${unit}`;
  }
  return "";
}

/** "3d 19h", "5h 12m", "7m". */
export function formatUptime(seconds: number): string {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const days = Math.floor(whole / 86_400);
  const hours = Math.floor((whole % 86_400) / 3_600);
  const minutes = Math.floor((whole % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** "4.51 3.26 2.24"; null for anything but three numbers. */
export function formatLoadAverage(averages: readonly number[] | null | undefined): string | null {
  if (!averages || averages.length !== 3 || !averages.every(Number.isFinite)) return null;
  return averages.map((value) => Math.max(0, value).toFixed(2)).join(" ");
}

/** A share of a used amount in its total, 0 to 100; null when either is unknown or the total is 0. */
export function shareOf(
  used: number | null | undefined,
  total: number | null | undefined,
): number | null {
  if (used == null || total == null || !(total > 0)) return null;
  return clampPercent((used / total) * 100);
}
