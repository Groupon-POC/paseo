// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for the composer pill's Monitor watches.

import { describe, expect, it, vi } from "vitest";
import {
  monitorTimeLeft,
  monitorsPillLabel,
  readAgentMonitors,
  runningMonitors,
  type AgentMonitor,
} from "./agent-monitors-model";

const NOW = Date.parse("2026-10-28T00:10:00Z");
const monitor = (overrides: Partial<AgentMonitor>): AgentMonitor => ({
  taskId: "b1",
  description: "build log",
  command: "tail -f build.log",
  startedAt: "2026-10-28T00:00:00Z",
  expiresAt: "2026-10-28T00:30:00Z",
  ...overrides,
});

describe("the agent's Monitor watches in the composer pill", () => {
  it("reads the daemon's answer, dropping a watch without a task", async () => {
    const client = {
      invokePluginRpc: vi.fn(async () => ({
        monitors: [
          monitor({}),
          { description: "no task" },
          monitor({ taskId: "b2", expiresAt: null }),
        ],
      })),
    };

    const monitors = await readAgentMonitors(client, "agent-1");

    expect(client.invokePluginRpc).toHaveBeenCalledWith(
      "groupon-desk",
      "groupon-desk.agent.monitors",
      { agentId: "agent-1" },
    );
    expect(monitors.map((m) => [m.taskId, m.expiresAt])).toEqual([
      ["b1", "2026-10-28T00:30:00Z"],
      ["b2", null],
    ]);
  });

  it("counts and names the watches still running, with the time each has left", () => {
    const monitors = [
      monitor({}),
      monitor({ taskId: "gone", expiresAt: "2026-10-28T00:09:00Z" }),
      monitor({ taskId: "b3", description: "", expiresAt: null }),
    ];

    const running = runningMonitors(monitors, NOW);

    expect(running.map((m) => m.taskId)).toEqual(["b1", "b3"]);
    expect(monitorsPillLabel(running.length)).toBe("2 monitors");
    expect(monitorsPillLabel(1)).toBe("1 monitor");
    expect(running.map((m) => monitorTimeLeft(m, NOW))).toEqual(["20 min left", "until stopped"]);
    // The last minute counts down in seconds, and the clock passing moves it.
    const ending = monitor({ expiresAt: "2026-10-28T00:10:45Z" });
    expect(monitorTimeLeft(ending, NOW)).toBe("45 s left");
    expect(monitorTimeLeft(ending, NOW + 30_000)).toBe("15 s left");
    expect(monitorTimeLeft(monitor({}), NOW + 9 * 60_000)).toBe("11 min left");
  });
});
