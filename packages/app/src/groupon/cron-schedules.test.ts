// Added for Groupon Desk (fork of Paseo, Apache-2.0).
/** Deduplicate only equal portable cron definitions and acknowledge every old copy before activation. */
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import type { AggregatedSchedule } from "@/schedules/aggregated-schedules";
import { groupCronSchedules, placeCronGroup } from "./cron-schedules";
function copy(
  serverId: string,
  id: string,
  status: "active" | "paused" = "paused",
): AggregatedSchedule {
  return {
    serverId,
    serverName: serverId,
    id,
    name: "daily",
    prompt: "Read the daily report",
    cadence: { type: "cron", expression: "0 7 * * *", timezone: "Europe/Prague" },
    status,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    nextRunAt: null,
    lastRunAt: null,
    pausedAt: null,
    expiresAt: null,
    maxRuns: null,
    cron: { name: `daily-${id}`, home: `/home/${serverId}` },
    target: {
      type: "new-agent",
      config: {
        provider: "claude",
        cwd: `/home/${serverId}`,
        model: "sonnet",
        systemPrompt: `You are run unattended by \`groupon cron\` as the job "daily-${id}", on a schedule.\nRead only.`,
      },
    },
  };
}
describe("shared cron rows", () => {
  it("shows one definition across Macs and old local copies, preferring the active host", () => {
    const rows = [
      copy("air", "one"),
      copy("mini", "two", "active"),
      copy("studio", "three"),
      copy("studio", "four"),
    ];
    const groups = groupCronSchedules(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.copies).toHaveLength(4);
    expect(groups[0]?.schedule.serverId).toBe("mini");
  });
  it("does not merge changed instructions, models, permissions, cadence, or arbitrary folders", () => {
    const base = copy("air", "one");
    for (const changed of [
      { ...copy("mini", "two"), prompt: "Write a different report" },
      { ...copy("mini", "two"), cadence: { type: "every" as const, everyMs: 60000 } },
      {
        ...copy("mini", "two"),
        target: {
          type: "new-agent" as const,
          config: { provider: "claude" as const, cwd: "/work/other" },
        },
      },
      { ...copy("mini", "two"), cron: undefined },
    ])
      expect(groupCronSchedules([base, changed])).toHaveLength(2);
  });
  it("keeps schedules tied to individual chats separate", () => {
    const a = copy("air", "one");
    const b = copy("mini", "two");
    a.target = b.target = { type: "agent", agentId: "00000000-0000-4000-8000-000000000001" };
    expect(groupCronSchedules([a, b])).toHaveLength(2);
  });
});
describe("cron handoff", () => {
  const copies = [copy("air", "one", "active"), copy("mini", "two")];
  function setup() {
    const calls: string[] = [];
    const invokePluginRpc = vi.fn(async (_plugin: string, _method: string, value: unknown) => {
      const parsed = z.object({ scheduleId: z.string(), active: z.boolean() }).parse(value);
      calls.push(`${parsed.scheduleId}:${parsed.active}`);
      return { shared: true };
    });
    return {
      calls,
      invokePluginRpc,
      input: {
        copies,
        target: copies[1]!,
        getClient: () => ({ invokePluginRpc }),
        isOnline: () => true,
        allHostsLoaded: true,
      },
    };
  }
  it("pauses every copy before activating the selected computer", async () => {
    const f = setup();
    await placeCronGroup(f.input);
    expect(f.calls).toEqual(["one:false", "two:false", "two:true"]);
  });
  it("pauses the logical job on all computers", async () => {
    const f = setup();
    await placeCronGroup({ ...f.input, target: null });
    expect(f.calls).toEqual(["one:false", "two:false"]);
  });
  it("never activates a destination after a failed pause", async () => {
    const f = setup();
    f.invokePluginRpc.mockRejectedValueOnce(new Error("offline"));
    await expect(placeCronGroup(f.input)).rejects.toThrow("offline");
    expect(f.invokePluginRpc).toHaveBeenCalledTimes(1);
  });
  it("refuses an unknown or offline copy before making any change", async () => {
    const f = setup();
    await expect(placeCronGroup({ ...f.input, isOnline: () => false })).rejects.toThrow(
      "connected",
    );
    expect(f.invokePluginRpc).not.toHaveBeenCalled();
  });
  it("requires all hosts to load before a cross-Mac switch", async () => {
    const f = setup();
    await expect(placeCronGroup({ ...f.input, allHostsLoaded: false })).rejects.toThrow(
      "Connect all",
    );
    expect(f.invokePluginRpc).not.toHaveBeenCalled();
  });
  it("does not activate after an unshared placement reply", async () => {
    const f = setup();
    f.invokePluginRpc.mockResolvedValueOnce({ shared: false });
    await expect(placeCronGroup(f.input)).rejects.toThrow("shared");
    expect(f.invokePluginRpc).toHaveBeenCalledTimes(1);
  });
});
