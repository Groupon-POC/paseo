// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for reading an agent's running Monitor watches.

import { describe, expect, it } from "vitest";
import {
  activeMonitorsOf,
  aliveOnly,
  backgroundWorkspaceIdsOf,
  evalledCommand,
  monitorGroupsOf,
  psVisible,
  stopAgentMonitor,
  type AgentMonitor,
  type ProcessRow,
} from "./agent-monitors";

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
        kind: "monitor",
        taskId: "a1",
        description: "build log",
        command: "",
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

  it("leaves out a watch the person stopped from the window", () => {
    const rows = [monitorCall("a1", { description: "x" }, "2026-10-28T00:09:00Z")];

    expect(activeMonitorsOf(rows, NOW, SINCE, new Set(["a1"]))).toEqual([]);
  });
});

describe("stopping a watch from the window", () => {
  const COMMAND = `tail -n 0 -F /tmp/build.log | grep --line-buffered 'error'`;
  // How Claude Code runs a shell: its snapshot, then the command single-quoted for eval.
  const shell = (command: string) =>
    `/bin/zsh -c source snap.sh 2>/dev/null || true && eval '${command.replaceAll("'", "'\\''")}' < /dev/null && pwd -P >| /tmp/claude-1-cwd`;
  const processes: ProcessRow[] = [
    { pid: 100, ppid: 1, pgid: 100, command: "node hand" },
    { pid: 200, ppid: 100, pgid: 100, command: "/Users/n/.local/bin/claude --output-format x" },
    { pid: 300, ppid: 100, pgid: 100, command: "/Users/n/.local/bin/claude --other-agent" },
    { pid: 210, ppid: 200, pgid: 210, command: shell(COMMAND) },
    { pid: 211, ppid: 210, pgid: 210, command: "tail -n 0 -F /tmp/build.log" },
    // A shell that only mentions the command (the agent searching for it) is not the watch.
    { pid: 230, ppid: 200, pgid: 230, command: shell(`ps -ax | grep "${COMMAND}"`) },
    // The same command under another agent's process is not this agent's watch.
    { pid: 310, ppid: 300, pgid: 310, command: shell(COMMAND) },
    // A shell in the agent's own group (not a watch's group of its own) is never ended.
    { pid: 220, ppid: 200, pgid: 200, command: shell(COMMAND) },
  ];
  const monitor: AgentMonitor = {
    kind: "monitor",
    taskId: "b1",
    description: "build errors",
    command: COMMAND,
    startedAt: "2026-10-28T00:01:00.000Z",
    expiresAt: null,
  };

  it("finds only the watch's own process group under the agent's Claude Code process", () => {
    expect(monitorGroupsOf(processes, new Set([200]), COMMAND)).toEqual([210]);
    expect(monitorGroupsOf(processes, new Set([200]), "")).toEqual([]);
    expect(evalledCommand(shell(COMMAND))).toBe(COMMAND);
    expect(evalledCommand("tail -f x")).toBeNull();
    // A Monitor watch's wrapper has no `< /dev/null` after its eval.
    expect(
      evalledCommand(
        `/bin/zsh -c source s.sh && eval 'echo '"'"'a b'"'"'' && pwd -P >| /tmp/claude-1-cwd`,
      ),
    ).toBe("echo 'a b'");
  });

  it("finds a multi-line, quoted, non-ASCII command as macOS ps lists its shell", () => {
    const command = `R=roll_1; while :; do\n  echo "$(jq -c '.data')" | grep -q '"done"' && break # Ждём\n  sleep 60\ndone`;
    // Measured on macOS: a newline in octal, Claude Code's '"'"' quote, UTF-8 bytes in meta notation.
    const listed = `/bin/zsh -c source snap.sh 2>/dev/null || true && eval 'R=roll_1; while :; do\\012  echo "$(jq -c '"'"'.data'"'"')" | grep -q '"'"'"done"'"'"' && break # M-PM^VM-PM-4M-QM^QM-PM-<\\012  sleep 60\\012done' < /dev/null && pwd -P >| /tmp/claude-1-cwd`;
    const rows: ProcessRow[] = [
      { pid: 200, ppid: 100, pgid: 100, command: "/Users/n/.local/bin/claude" },
      { pid: 240, ppid: 200, pgid: 240, command: listed },
    ];

    expect(psVisible("a\tb\\c Р щ\u00ff")).toBe("a\\011b\\c M-P\\240 M-QM^IM-CM-?");
    expect(monitorGroupsOf(rows, new Set([200]), command)).toEqual([240]);
    expect(monitorGroupsOf(rows, new Set([200]), command.replace("60", "61"))).toEqual([]);
  });

  it("ends that group, found by the agent's session id, and hides the watch at once", async () => {
    const killed: number[] = [];
    const answer = await stopAgentMonitor(
      { agentId: "agent-1", monitor },
      {
        daemonPid: 100,
        listProcesses: async () => processes,
        environmentOf: async (pid) =>
          pid === 200
            ? "HOME=/x GROUPON_DESK_SESSION_ID=agent-1"
            : "GROUPON_DESK_SESSION_ID=agent-2",
        killGroup: (pgid) => killed.push(pgid),
      },
    );

    expect(answer).toEqual({ stopped: true });
    expect(killed).toEqual([210]);
    expect(
      activeMonitorsOf(
        [monitorCall("b1", { description: "x", persistent: true }, "2026-10-28T00:01:00Z")],
        NOW,
        SINCE,
      ),
    ).toEqual([]);
  });

  it("says so when the watch's process is not running", async () => {
    const answer = await stopAgentMonitor(
      { agentId: "agent-3", monitor },
      {
        daemonPid: 100,
        listProcesses: async () => processes,
        environmentOf: async () => "",
        killGroup: () => {
          throw new Error("must not kill");
        },
      },
    );

    expect(answer).toEqual({ stopped: false });
  });
});

describe("an agent's background commands", () => {
  const bash = (taskId: string, description: string, command: string, at: string) => ({
    timestamp: at,
    item: {
      type: "tool_call",
      name: "Bash",
      status: "completed",
      detail: {
        type: "shell",
        command,
        description,
        output: `Command running in background with ID: ${taskId}. Output is being written to: /tmp/x`,
      },
    },
  });
  const notice = (label: string, at: string) => ({
    timestamp: at,
    item: {
      type: "tool_call",
      name: "task_notification",
      status: "completed",
      detail: { type: "plain_text", label, text: label },
    },
  });

  it("lists a command run in the background until a notice of its end, which may name only its description", () => {
    const rows = [
      bash("c1", "Build Desk", "pnpm desk:build", "2026-10-28T00:01:00Z"),
      bash("c2", "Run tests", "pnpm test", "2026-10-28T00:02:00Z"),
      // A shell command that ran in the foreground is no task.
      {
        timestamp: "2026-10-28T00:03:00Z",
        item: {
          type: "tool_call",
          name: "Bash",
          status: "completed",
          detail: { type: "shell", command: "ls", output: "a b" },
        },
      },
      notice('Background command "Build Desk" completed (exit code 0)', "2026-10-28T00:05:00Z"),
    ];

    expect(activeMonitorsOf(rows, NOW, SINCE).map((m) => [m.kind, m.taskId, m.expiresAt])).toEqual([
      ["command", "c2", null],
    ]);
  });

  it("keeps only the tasks whose process still runs under the agent's Claude Code process", () => {
    const shell = (command: string) =>
      `/bin/zsh -c source snap.sh && eval '${command}' < /dev/null && pwd -P >| /tmp/claude-1-cwd`;
    const processes: ProcessRow[] = [
      { pid: 200, ppid: 100, pgid: 100, command: "/x/claude" },
      { pid: 210, ppid: 200, pgid: 210, command: shell("pnpm test") },
    ];
    const tasks = activeMonitorsOf(
      [
        bash("c2", "Run tests", "pnpm test", "2026-10-28T00:02:00Z"),
        bash("c3", "Gone", "sleep 1", "2026-10-28T00:02:00Z"),
      ],
      NOW,
      SINCE,
    );

    expect(aliveOnly(tasks, processes, new Set([200])).map((m) => m.taskId)).toEqual(["c2"]);
    expect(aliveOnly(tasks, processes, new Set())).toEqual([]);
  });
});

describe("the sidebar's background marks", () => {
  const shell = (command: string) =>
    `/bin/zsh -c source snap.sh && eval '${command}' < /dev/null && pwd -P >| /tmp/claude-1-cwd`;
  const task = (taskId: string, command: string): AgentMonitor => ({
    kind: "command",
    taskId,
    description: taskId,
    command,
    startedAt: "2026-10-28T00:02:00.000Z",
    expiresAt: null,
  });

  it("names the workspaces whose agents still run a background task, listing processes once", async () => {
    let listings = 0;
    const deps = {
      daemonPid: 100,
      listProcesses: async (): Promise<ProcessRow[]> => {
        listings += 1;
        return [
          { pid: 200, ppid: 100, pgid: 100, command: "/x/claude a" },
          { pid: 300, ppid: 100, pgid: 100, command: "/x/claude b" },
          { pid: 210, ppid: 200, pgid: 210, command: shell("pnpm test") },
        ];
      },
      environmentOf: async (pid: number) =>
        pid === 200 ? "GROUPON_DESK_SESSION_ID=agent-a" : "GROUPON_DESK_SESSION_ID=agent-b",
    };

    const ids = await backgroundWorkspaceIdsOf(
      [
        { agentId: "agent-a", workspaceId: "ws-a", candidates: [task("c1", "pnpm test")] },
        // Its task ended with no notice: no process runs it any more.
        { agentId: "agent-b", workspaceId: "ws-b", candidates: [task("c2", "sleep 600")] },
        { agentId: "agent-c", workspaceId: "ws-c", candidates: [] },
      ],
      deps,
    );

    expect(ids).toEqual(["ws-a"]);
    expect(listings).toBe(1);
  });

  it("lists no process when no agent has a task", async () => {
    const listProcesses = async (): Promise<ProcessRow[]> => {
      throw new Error("not listed");
    };

    expect(
      await backgroundWorkspaceIdsOf([{ agentId: "a", workspaceId: "w", candidates: [] }], {
        daemonPid: 1,
        listProcesses,
        environmentOf: async () => "",
      }),
    ).toEqual([]);
  });
});
