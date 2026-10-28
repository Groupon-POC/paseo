// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for the Changes comparison an agent asks for a workspace.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compareRequestOf, workspaceCompareLedger } from "./workspace-compare.js";

const NOW = new Date("2026-10-28T19:00:00Z");

describe("compareRequestOf", () => {
  it("reads a comparison and the base ref it diffs against", () => {
    expect(
      compareRequestOf({ comparison: "base", baseRef: "origin/B2B/ENC-1/rc-19" }, NOW),
    ).toEqual({
      comparison: "base",
      baseRef: "origin/B2B/ENC-1/rc-19",
      requestedAt: "2026-10-28T19:00:00.000Z",
    });
    expect(compareRequestOf({ comparison: "uncommitted" }, NOW)?.baseRef).toBeNull();
    expect(compareRequestOf(undefined, NOW)).toBeNull();
  });

  it("refuses a comparison the window does not know, and a base that is not a ref name", () => {
    expect(() => compareRequestOf({ comparison: "everything" }, NOW)).toThrow(/compare.comparison/);
    expect(() => compareRequestOf({ comparison: "base", baseRef: "--output=/tmp/x" }, NOW)).toThrow(
      /baseRef/,
    );
    expect(() => compareRequestOf({ comparison: "base", baseRef: "main..HEAD" }, NOW)).toThrow(
      /baseRef/,
    );
    expect(() => compareRequestOf("base", NOW)).toThrow(/object/);
  });
});

describe("workspaceCompareLedger", () => {
  const homes: string[] = [];
  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("keeps the newest request of each workspace across reads", async () => {
    const home = await mkdtemp(join(tmpdir(), "workspace-compare-"));
    homes.push(home);
    const ledger = workspaceCompareLedger(home);
    const first = compareRequestOf({ comparison: "all" }, NOW);
    const second = compareRequestOf(
      { comparison: "base", baseRef: "origin/main" },
      new Date("2026-10-28T19:05:00Z"),
    );

    if (first && second) {
      await ledger.remember("w1", first);
      await ledger.remember("w1", second);
      await ledger.remember("w2", first);
    }

    expect(await workspaceCompareLedger(home).all()).toEqual({ w1: second, w2: first });
  });
});
