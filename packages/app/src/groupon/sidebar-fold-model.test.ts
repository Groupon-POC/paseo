// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for the folded sidebar's two lines.
import { describe, expect, it } from "vitest";
import type { PinnedUsageSource } from "@/usage/pinned";
import { foldedUsageLine, onlineCounts } from "./sidebar-fold-model";

const source = (name: string, percents: number[], muted = false): PinnedUsageSource => ({
  key: name,
  icon: null,
  name,
  muted,
  hint: null,
  windows: percents.map((percent, index) => ({
    key: `${name}/${index}`,
    label: "",
    shortLabel: "",
    percent,
    percentText: `${percent}%`,
    tone: "default",
  })),
});

describe("the folded sidebar", () => {
  it("counts the Macs online and offline", () => {
    expect(onlineCounts([{ online: true }, { online: false }, { online: true }])).toEqual({
      online: 2,
      offline: 1,
    });
  });

  it("names each account with its fullest limit and leaves out one that reports nothing", () => {
    const line = foldedUsageLine([
      source("zaruba", [90, 49, 41]),
      source("info3", [0, 85.4]),
      source("c_tzaruba", [], true),
    ]);

    expect(line).toBe("zaruba 90% · info3 85%");
  });
});
