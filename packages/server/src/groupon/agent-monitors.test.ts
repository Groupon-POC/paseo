// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for reading an agent's running Monitor watches.

import { describe, expect, it } from "vitest";
import { activeMonitorsOf } from "./agent-monitors";

const monitorCall = (taskId: string, input: Record<string, unknown>, at: string) => ({
  timestamp: at,
  item: {
    type: "tool_call",
    name: "Monitor",
    status: "completed",
    detail: {
      type: "unknown",
      input,
      output: { type: "command", output: `Monitor started (task ${taskId}, expires in 30m)` },
    },
  },
});

const notification = (taskId: string, extra: string, at: string) => ({
  timestamp: at,
  item: {
    type: "tool_call",
    name: "task_notification",
    status: "completed",
    detail: {
      type: "plain_text",
      text: `<task-notification>\n<task-id>${taskId}</task-id>${extra}`,
    },
  },
});

const SINCE = new Date("2026-10-28T00:00:00Z");
const NOW = new Date("2026-10-28T00:10:00Z");

describe("an agent's running Monitor watches", () => {
  it("keeps a started watch through its events and drops it once stopped or ended", () => {
    const rows = [
      monitorCall(
        "a1",
        { description: "build log", timeout_ms: 1_800_000 },
        "2026-10-28T00:01:00Z",
      ),
      monitorCall("b2", { description: "deploy", timeout_ms: 1_800_000 }, "2026-10-28T00:02:00Z"),
      monitorCall("c3", { description: "tests", timeout_ms: 1_800_000 }, "2026-10-28T00:03:00Z"),
      notification("a1", "\n<event>line</event>", "2026-10-28T00:04:00Z"),
      notification("b2", "\n<status>killed</status>", "2026-10-28T00:05:00Z"),
      {
        timestamp: "2026-10-28T00:06:00Z",
        item: {
          type: "tool_call",
          name: "TaskStop",
          status: "completed",
          detail: { input: { task_id: "c3" } },
        },
      },
    ];

    expect(activeMonitorsOf(rows, NOW, SINCE)).toEqual([
      {
        taskId: "a1",
        description: "build log",
        startedAt: "2026-10-28T00:01:00.000Z",
        expiresAt: "2026-10-28T00:31:00.000Z",
      },
    ]);
  });

  it("drops a watch past its timeout, keeps a persistent one, and forgets one from before the daemon started", () => {
    const rows = [
      monitorCall(
        "old",
        { description: "before restart", persistent: true },
        "2026-10-27T23:00:00Z",
      ),
      monitorCall("short", { description: "default timeout" }, "2026-10-28T00:01:00Z"),
      monitorCall(
        "forever",
        { description: "persistent", persistent: true },
        "2026-10-28T00:02:00Z",
      ),
    ];

    expect(activeMonitorsOf(rows, NOW, SINCE).map((m) => [m.taskId, m.expiresAt])).toEqual([
      ["forever", null],
    ]);
  });

  it("ignores a Monitor call that failed or never named its task", () => {
    const failed = monitorCall("x", {}, "2026-10-28T00:01:00Z");
    failed.item.status = "failed";
    const unnamed = {
      timestamp: "2026-10-28T00:01:00Z",
      item: {
        type: "tool_call",
        name: "Monitor",
        status: "completed",
        detail: { output: "error" },
      },
    };

    expect(activeMonitorsOf([failed, unnamed], NOW, SINCE)).toEqual([]);
  });
});
