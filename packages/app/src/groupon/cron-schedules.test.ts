// Added for Groupon Desk (fork of Paseo, Apache-2.0).
/** Deduplicate only equal portable cron definitions and acknowledge every old copy before activation. */
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import type { AggregatedSchedule } from "@/schedules/aggregated-schedules";
import {
  copiesHoldingRepository,
  groupCronSchedules,
  placeCronGroup,
  setCronRepository,
  updateCronCopies,
  removeCronCopies,
} from "./cron-schedules";
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

describe("shared cron edits and removal", () => {
  it("updates every copy while retaining each computer's home", async () => {
    const copies = [copy("air", "one"), copy("mini", "two")];
    const scheduleUpdate = vi.fn(
      async (_input: import("@getpaseo/client/internal/daemon-client").UpdateScheduleOptions) => ({
        requestId: "test",
        schedule: null,
        error: null,
      }),
    );
    await updateCronCopies({
      copies,
      update: {
        id: "one",
        prompt: "New instructions",
        newAgentConfig: { cwd: "/home/air", model: "new-model" },
      },
      getClient: () => ({ scheduleUpdate }),
    });
    expect(scheduleUpdate.mock.calls.map((call) => call[0])).toEqual([
      {
        id: "one",
        prompt: "New instructions",
        newAgentConfig: { cwd: "/home/air", model: "new-model" },
      },
      {
        id: "two",
        prompt: "New instructions",
        newAgentConfig: { cwd: "/home/mini", model: "new-model" },
      },
    ]);
  });
  it("checks every computer before starting a shared edit", async () => {
    const copies = [copy("air", "one"), copy("mini", "two")];
    const scheduleUpdate = vi.fn(
      async (_input: import("@getpaseo/client/internal/daemon-client").UpdateScheduleOptions) => ({
        requestId: "test",
        schedule: null,
        error: null,
      }),
    );
    await expect(
      updateCronCopies({
        copies,
        update: { id: "one", prompt: "New" },
        getClient: (host) => (host === "air" ? { scheduleUpdate } : null),
      }),
    ).rejects.toThrow("mini");
    expect(scheduleUpdate).not.toHaveBeenCalled();
  });
  it("stops all copies before removing their durable definitions", async () => {
    const calls: string[] = [];
    const copies = [copy("air", "one"), copy("mini", "two")];
    const invokePluginRpc = vi.fn(async (_plugin: string, method: string, value: unknown) => {
      const parsed = z
        .object({ scheduleId: z.string(), active: z.boolean().optional() })
        .parse(value);
      calls.push(`${parsed.scheduleId}:${method.endsWith("remove") ? "remove" : parsed.active}`);
      return method.endsWith("remove") ? { removed: true } : { shared: true };
    });
    await removeCronCopies({
      copies,
      target: null,
      getClient: () => ({ invokePluginRpc }),
      isOnline: () => true,
      allHostsLoaded: true,
    });
    expect(calls).toEqual(["one:false", "two:false", "one:remove", "two:remove"]);
  });
});

const REPOSITORY = "github.com/groupon2/engineering-development";

/** A copy of a cron that works in worktrees of its Mac's checkout of a repository. */
function repositoryCopy(
  serverId: string,
  id: string,
  status: "active" | "paused" = "paused",
): AggregatedSchedule {
  const base = copy(serverId, id, status);
  return {
    ...base,
    cron: {
      name: "refactoring",
      home: `/home/${serverId}`,
      repository: REPOSITORY,
      machine: `MAC-${serverId}`,
    },
    target: {
      type: "new-agent",
      config: {
        provider: "claude",
        cwd: `/home/${serverId}/git/engineering`,
        model: "sonnet",
        isolation: "worktree",
        archiveOnFinish: false,
        worktreeBranchPrefix: "cron/refactoring",
        systemPrompt:
          'You are run unattended by `groupon cron` as the job "refactoring", on a schedule.',
      },
    },
  };
}

describe("crons that work in a repository", () => {
  it("are one row across Macs although each Mac's checkout sits elsewhere", () => {
    const groups = groupCronSchedules([
      repositoryCopy("air", "one"),
      repositoryCopy("mini", "two", "active"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.schedule.serverId).toBe("mini");
  });

  it("offer only the Macs holding a checkout of the repository", () => {
    const copies = [repositoryCopy("air", "one"), repositoryCopy("mini", "two")];
    const repositories = [
      {
        repository: REPOSITORY,
        name: "engineering-development",
        checkouts: [{ machine: "MAC-mini", rootPath: "/r" }],
      },
    ];
    expect(copiesHoldingRepository(copies, repositories).map((entry) => entry.serverId)).toEqual([
      "mini",
    ]);
    expect(copiesHoldingRepository([copy("air", "one")], repositories)).toHaveLength(1);
  });

  it("edits every copy in its own Mac's checkout", async () => {
    const scheduleUpdate = vi.fn(
      async (_input: import("@getpaseo/client/internal/daemon-client").UpdateScheduleOptions) => ({
        requestId: "test",
        schedule: null,
        error: null,
      }),
    );
    await updateCronCopies({
      copies: [repositoryCopy("air", "one"), repositoryCopy("mini", "two")],
      update: { id: "one", newAgentConfig: { cwd: "/home/air", model: "new-model" } },
      getClient: () => ({ scheduleUpdate }),
    });
    expect(scheduleUpdate.mock.calls.map((call) => call[0].newAgentConfig?.cwd)).toEqual([
      "/home/air/git/engineering",
      "/home/mini/git/engineering",
    ]);
  });

  it("sets the repository through the copy's own Mac and passes its refusal on", async () => {
    const invokePluginRpc = vi.fn(async () => ({ scheduleId: "s9" }));
    await setCronRepository({
      copy: copy("air", "one"),
      repository: REPOSITORY,
      client: { invokePluginRpc },
    });
    expect(invokePluginRpc).toHaveBeenCalledWith("groupon", "groupon.cron-repository", {
      scheduleId: "one",
      repository: REPOSITORY,
    });
    invokePluginRpc.mockRejectedValueOnce(new Error("this Mac holds no checkout"));
    await expect(
      setCronRepository({
        copy: copy("air", "one"),
        repository: null,
        client: { invokePluginRpc },
      }),
    ).rejects.toThrow("no checkout");
  });
});
