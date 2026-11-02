// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for reading what a worktree has not committed yet.
import { describe, expect, it } from "vitest";
import { readUncommittedStat, uncommittedStatOf } from "./uncommitted-stat";

describe("uncommittedStatOf", () => {
  it("reads the daemon's stat", () => {
    expect(uncommittedStatOf({ stat: { additions: 10, deletions: 2 } })).toEqual({
      additions: 10,
      deletions: 2,
    });
  });

  it("is null when nothing is left uncommitted or the answer is not a stat", () => {
    expect(uncommittedStatOf({ stat: null })).toBeNull();
    expect(uncommittedStatOf({ stat: { additions: "10" } })).toBeNull();
    expect(uncommittedStatOf(undefined)).toBeNull();
  });
});

describe("readUncommittedStat", () => {
  it("asks the daemon by workspace id", async () => {
    const calls: unknown[] = [];
    const client = {
      invokePluginRpc: async (pluginId: string, method: string, input: unknown) => {
        calls.push({ pluginId, method, input });
        return { stat: { additions: 3, deletions: 0 } };
      },
    };
    expect(await readUncommittedStat(client, "wks_1")).toEqual({ additions: 3, deletions: 0 });
    expect(calls).toEqual([
      {
        pluginId: "groupon-desk",
        method: "groupon-desk.checkout.uncommitted-stat",
        input: { workspaceId: "wks_1" },
      },
    ]);
  });

  it("is null when the daemon predates the read", async () => {
    const client = {
      invokePluginRpc: async () => {
        throw new Error("Unknown method");
      },
    };
    expect(await readUncommittedStat(client, "wks_1")).toBeNull();
  });
});
