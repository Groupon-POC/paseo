// Added for Groupon Desk (fork of Paseo, Apache-2.0): Connected computers' load card (WW-97).
/**
 * Tests for a Mac's load history and the card's wording: the history ring, the bars, bytes and
 * speeds in words, the uptime and the load average.
 *
 * Covers: packages/app/src/groupon/machine-load-model.ts
 */
import { describe, expect, it } from "vitest";
import type { HubMachineLoad } from "./hub";
import {
  appendSample,
  formatBytes,
  formatCompactRate,
  formatLoadAverage,
  formatPercent,
  formatRate,
  formatUptime,
  isHot,
  LOAD_HISTORY_LENGTH,
  percentBars,
  rateBars,
  recordSamples,
  shareOf,
} from "./machine-load-model";

const at = (second: number) => new Date(Date.UTC(2026, 9, 22, 10, 0, second)).toISOString();
const sample = (second: number, overrides: Partial<HubMachineLoad> = {}): HubMachineLoad => ({
  cpuPercent: second,
  memoryPercent: 50,
  sampledAt: at(second),
  ...overrides,
});

describe("the history ring", () => {
  it("adds a newer sample, oldest first", () => {
    const history = appendSample(appendSample([], sample(0)), sample(10));

    expect(history.map((entry) => entry.sampledAt)).toEqual([at(0), at(10)]);
  });

  it("takes a sample once: the same or an older one leaves the same array", () => {
    const history = appendSample([], sample(10));

    expect(appendSample(history, sample(10))).toBe(history);
    expect(appendSample(history, sample(5))).toBe(history);
  });

  it("keeps the last 60 samples, dropping the oldest", () => {
    let history: readonly HubMachineLoad[] = [];
    for (let second = 0; second < LOAD_HISTORY_LENGTH + 5; second += 1) {
      history = appendSample(
        history,
        sample(second % 60, {
          sampledAt: new Date(Date.UTC(2026, 9, 22, 10, 0, 0) + second * 10_000).toISOString(),
        }),
      );
    }

    expect(LOAD_HISTORY_LENGTH).toBe(60);
    expect(history).toHaveLength(60);
    expect(history[0]?.sampledAt).toBe(
      new Date(Date.UTC(2026, 9, 22, 10, 0, 0) + 5 * 10_000).toISOString(),
    );
  });

  it("records every Mac's samples, and hands back the same map when none was new", () => {
    const first = recordSamples(new Map(), [
      ["air", sample(0)],
      ["mini", sample(0)],
      ["air", sample(10)],
    ]);

    expect(first.get("air")).toHaveLength(2);
    expect(first.get("mini")).toHaveLength(1);
    expect(recordSamples(first, [["air", sample(10)]])).toBe(first);
  });
});

describe("the bars", () => {
  it("draws shares as they are, clamped to 0 to 100", () => {
    expect(
      percentBars(
        [sample(0, { cpuPercent: 12.5 }), sample(1, { cpuPercent: 140 })],
        (s) => s.cpuPercent,
      ),
    ).toEqual([12.5, 100]);
  });

  it("scales speeds to the history's peak, an idle network low, a missing speed as 0", () => {
    const history = [
      sample(0, { netRxBytesPerSecond: 50_000 }),
      sample(1, { netRxBytesPerSecond: 25_000 }),
      sample(2, { netRxBytesPerSecond: null }),
    ];

    expect(rateBars(history, (s) => s.netRxBytesPerSecond)).toEqual([100, 50, 0]);
    expect(
      rateBars([sample(0, { netRxBytesPerSecond: 100 })], (s) => s.netRxBytesPerSecond),
    ).toEqual([10]);
  });
});

describe("the wording", () => {
  it("says a share with one decimal below 10", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(1.84)).toBe("1.8%");
    expect(formatPercent(9.96)).toBe("10%");
    expect(formatPercent(25.4)).toBe("25%");
    expect(formatPercent(Number.NaN)).toBe("0%");
  });

  it("says memory in binary units and disk in decimal ones", () => {
    expect(formatBytes(3.8 * 1024 ** 3, 1024)).toBe("3.8 GB");
    expect(formatBytes(16 * 1024 ** 3, 1024)).toBe("16.0 GB");
    expect(formatBytes(48.6e9, 1000)).toBe("48.6 GB");
    expect(formatBytes(512, 1000)).toBe("512 B");
    expect(formatBytes(999_960, 1000)).toBe("1.0 MB");
    expect(formatBytes(-5, 1000)).toBe("0 B");
  });

  it("says a speed in B/s, KB/s and MB/s", () => {
    expect(formatRate(0)).toBe("0 B/s");
    expect(formatRate(45_800)).toBe("45.8 KB/s");
    expect(formatRate(1_250_000)).toBe("1.3 MB/s");
  });

  it("says a speed in four characters at most for the strip", () => {
    expect(formatCompactRate(512)).toBe("512");
    expect(formatCompactRate(45_800)).toBe("46K");
    expect(formatCompactRate(9_940)).toBe("9.9K");
    expect(formatCompactRate(1_200_000)).toBe("1.2M");
    expect(formatCompactRate(999_600)).toBe("1.0M");
  });

  it("says the uptime in days and hours, hours and minutes, or minutes", () => {
    expect(formatUptime(3 * 86_400 + 19 * 3_600 + 59)).toBe("3d 19h");
    expect(formatUptime(5 * 3_600 + 12 * 60)).toBe("5h 12m");
    expect(formatUptime(7 * 60 + 30)).toBe("7m");
  });

  it("says the load average with two decimals, and nothing for anything but three numbers", () => {
    expect(formatLoadAverage([4.512, 3.26, 2.2])).toBe("4.51 3.26 2.20");
    expect(formatLoadAverage([1, 2])).toBeNull();
    expect(formatLoadAverage(null)).toBeNull();
  });

  it("turns amber above 80 percent", () => {
    expect(isHot(80)).toBe(false);
    expect(isHot(80.1)).toBe(true);
  });

  it("takes a share of a used amount only with both and a total above 0", () => {
    expect(shareOf(25, 100)).toBe(25);
    expect(shareOf(25, 0)).toBeNull();
    expect(shareOf(null, 100)).toBeNull();
  });
});
