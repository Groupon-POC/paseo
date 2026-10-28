// Added for Groupon Desk (fork of Paseo, Apache-2.0): the Monitor watches an agent has running, read from its timeline.

/**
 * Claude Code's Monitor tool starts a background watch that wakes the agent on each line of a
 * command's output. The window shows which watches an agent has running, beside Share above the
 * composer; this reads them from the agent's timeline: a completed Monitor call whose answer names
 * its task, not yet ended by a TaskStop of that task, a task notification carrying an end status,
 * its timeout, or the end of the daemon process the agent ran under.
 *
 * The person may stop one from the window (`stopAgentMonitor`): the watch is a shell Claude Code
 * started as a process group of its own under the agent's process, found by the agent's session id
 * in that process's environment and the watch's command in the shell's, and ended with SIGTERM;
 * Claude Code then tells the agent the watch ended.
 *
 * Constraints:
 * - Reading never changes anything; stopping ends only a process group led by a child of the
 *   agent's own Claude Code process, never that process or anything else
 */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

/** The Groupon Desk plugin RPC the window calls: `{ agentId }`, answered `{ monitors }`. */
export const AGENT_MONITORS_RPC = "groupon-desk.agent.monitors";

/** The window's "stop this watch": `{ agentId, taskId }`, answered `{ stopped }`. */
export const AGENT_MONITOR_STOP_RPC = "groupon-desk.agent.monitor.stop";

/** Watches the person stopped from the window, gone before the agent's own notice of it lands. */
const STOPPED_MONITORS = new Set<string>();

/** Claude Code's default Monitor timeout when the call names none. */
const DEFAULT_MONITOR_TIMEOUT_MS = 300_000;

export interface AgentMonitor {
  taskId: string;
  description: string;
  /** The command it watches, as the agent gave it. */
  command: string;
  startedAt: string;
  /** Null for a persistent watch, which runs until stopped. */
  expiresAt: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function toolCall(
  item: unknown,
): { name: string; status: unknown; detail: Record<string, unknown> } | null {
  if (!isRecord(item) || item.type !== "tool_call" || typeof item.name !== "string") return null;
  return { name: item.name, status: item.status, detail: isRecord(item.detail) ? item.detail : {} };
}

function startedMonitor(
  call: { status: unknown; detail: Record<string, unknown> },
  timestamp: string,
): AgentMonitor | null {
  if (call.status !== "completed") return null;
  const taskId = /Monitor started \(task ([\w-]+)/.exec(
    JSON.stringify(call.detail.output ?? ""),
  )?.[1];
  const startedAt = Date.parse(timestamp);
  if (!taskId || Number.isNaN(startedAt)) return null;
  const input = isRecord(call.detail.input) ? call.detail.input : {};
  const timeout =
    typeof input.timeout_ms === "number" && input.timeout_ms > 0
      ? input.timeout_ms
      : DEFAULT_MONITOR_TIMEOUT_MS;
  return {
    taskId,
    description: typeof input.description === "string" ? input.description : "",
    command: typeof input.command === "string" ? input.command : "",
    startedAt: new Date(startedAt).toISOString(),
    expiresAt: input.persistent === true ? null : new Date(startedAt + timeout).toISOString(),
  };
}

/** The task a row ends: a TaskStop of it, or a notification of it that carries an end status. */
function endedTask(call: { name: string; detail: Record<string, unknown> }): string | null {
  if (call.name === "TaskStop") {
    const input = isRecord(call.detail.input) ? call.detail.input : {};
    const id = input.task_id ?? input.shell_id;
    return typeof id === "string" ? id : null;
  }
  if (call.name !== "task_notification" || typeof call.detail.text !== "string") return null;
  const text = call.detail.text;
  if (!/<status>[^<]+<\/status>/.test(text)) return null;
  return /<task-id>([^<]+)<\/task-id>/.exec(text)?.[1] ?? null;
}

/**
 * The watches still running at `now`, oldest first. A watch started before `aliveSince` (when the
 * daemon process, and so the agent's Claude Code process under it, started) died with the old one.
 */
export function activeMonitorsOf(
  rows: readonly { timestamp: string; item: unknown }[],
  now: Date,
  aliveSince: Date,
  stopped: ReadonlySet<string> = STOPPED_MONITORS,
): AgentMonitor[] {
  const monitors = new Map<string, AgentMonitor>();
  for (const row of rows) {
    const call = toolCall(row.item);
    if (!call) continue;
    if (call.name === "Monitor") {
      const monitor = startedMonitor(call, row.timestamp);
      if (monitor) monitors.set(monitor.taskId, monitor);
      continue;
    }
    const ended = endedTask(call);
    if (ended) monitors.delete(ended);
  }
  return [...monitors.values()].filter(
    (monitor) =>
      !stopped.has(monitor.taskId) &&
      Date.parse(monitor.startedAt) >= aliveSince.getTime() &&
      (monitor.expiresAt === null || Date.parse(monitor.expiresAt) > now.getTime()),
  );
}

export interface ProcessRow {
  pid: number;
  ppid: number;
  pgid: number;
  command: string;
}

export interface MonitorStopDeps {
  /** The daemon's own pid: the agents' Claude Code processes are its children. */
  daemonPid: number;
  listProcesses: () => Promise<ProcessRow[]>;
  /** A process's environment as `NAME=value` text. */
  environmentOf: (pid: number) => Promise<string>;
  /** Ends a process group. */
  killGroup: (pgid: number) => void;
}

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * The command a Claude Code shell runs: its wrapper ends in `eval '<command>' < /dev/null`, the
 * command single-quoted for the shell. Null for a line of another shape.
 */
export function evalledCommand(commandLine: string): string | null {
  const start = commandLine.indexOf(" eval '");
  const end = commandLine.lastIndexOf("' < /dev/null");
  if (start < 0 || end <= start) return null;
  return commandLine.slice(start + " eval '".length, end).replaceAll("'\\''", "'");
}

/**
 * The process groups that run exactly a watch's command under the agent's Claude Code processes:
 * a shell of its own group whose evaluated command is the watch's, so a shell that only mentions
 * the command (an agent searching for it) is never one.
 */
export function monitorGroupsOf(
  processes: readonly ProcessRow[],
  agentPids: ReadonlySet<number>,
  command: string,
): number[] {
  const wanted = collapse(command);
  if (!wanted) return [];
  return processes
    .filter((row) => {
      if (!agentPids.has(row.ppid) || row.pid !== row.pgid || agentPids.has(row.pgid)) return false;
      const evalled = evalledCommand(row.command);
      return evalled !== null && collapse(evalled) === wanted;
    })
    .map((row) => row.pgid);
}

/**
 * Stops one of an agent's running watches: its shell's process group under the agent's Claude
 * Code process. Answers whether one was found; the watch leaves the window's list at once.
 */
export async function stopAgentMonitor(
  input: { agentId: string; monitor: AgentMonitor },
  deps: MonitorStopDeps,
): Promise<{ stopped: boolean }> {
  const processes = await deps.listProcesses();
  const agentPids = new Set<number>();
  for (const row of processes) {
    if (row.ppid !== deps.daemonPid || !/claude/.test(row.command)) continue;
    const environment = await deps.environmentOf(row.pid);
    if (environment.includes(`GROUPON_DESK_SESSION_ID=${input.agentId}`)) agentPids.add(row.pid);
  }
  const groups = monitorGroupsOf(processes, agentPids, input.monitor.command);
  for (const group of groups) deps.killGroup(group);
  if (groups.length > 0) STOPPED_MONITORS.add(input.monitor.taskId);
  return { stopped: groups.length > 0 };
}

const run = promisify(execFile);

/** This Mac's processes, the environment of one, and ending a group, for `stopAgentMonitor`. */
export function nodeMonitorStopDeps(): MonitorStopDeps {
  return {
    daemonPid: process.pid,
    listProcesses: async () => {
      const { stdout } = await run("ps", ["-axww", "-o", "pid=,ppid=,pgid=,command="], {
        maxBuffer: 16 * 1024 * 1024,
      });
      return stdout.split("\n").flatMap((line) => {
        const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
        return match
          ? [
              {
                pid: Number(match[1]),
                ppid: Number(match[2]),
                pgid: Number(match[3]),
                command: match[4] ?? "",
              },
            ]
          : [];
      });
    },
    environmentOf: async (pid) => {
      try {
        if (process.platform === "linux") {
          return (await readFile(`/proc/${pid}/environ`, "utf8")).replaceAll("\0", " ");
        }
        const { stdout } = await run("ps", ["-wwE", "-o", "command=", "-p", String(pid)]);
        return stdout;
      } catch {
        // A process that ended, or one this user may not read, is not the agent's.
        return "";
      }
    },
    killGroup: (pgid) => process.kill(-pgid, "SIGTERM"),
  };
}
