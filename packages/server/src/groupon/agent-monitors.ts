// Added for Groupon Desk (fork of Paseo, Apache-2.0): what an agent has running in the background (Monitor watches and background commands), read from its timeline and checked against its processes.

/**
 * Claude Code's Monitor tool starts a background watch that wakes the agent on each line of a
 * command's output. The window shows which watches an agent has running, beside Share above the
 * composer; this reads them from the agent's timeline: a completed Monitor call whose answer names
 * its task, not yet ended by a TaskStop of that task, a task notification carrying an end status,
 * its timeout, or the end of the daemon process the agent ran under. A shell command the agent ran
 * in the background (Bash with run_in_background) is read the same way: its answer names its task,
 * and a notice of its end names it, or only its description. Each is then checked against the
 * agent's processes (`aliveOnly`), so one whose process has ended leaves the list even when no
 * notice said so.
 *
 * The person may stop one from the window (`stopAgentMonitor`): the watch is a shell Claude Code
 * started as a process group of its own under the agent's process, found by the agent's session id
 * in that process's environment and the watch's command in the shell's, and ended with SIGTERM;
 * Claude Code then tells the agent the watch ended.
 *
 * `backgroundWorkspaceIdsOf` answers the sidebar which workspaces have such a task running, so
 * their rows turn while their agents wait.
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

/** The sidebar's busy-in-the-background marks: `{}`, answered `{ workspaceIds }`. */
export const BACKGROUND_WORKSPACES_RPC = "groupon-desk.workspaces.background";

/** Watches the person stopped from the window, gone before the agent's own notice of it lands. */
const STOPPED_MONITORS = new Set<string>();

/** Claude Code's default Monitor timeout when the call names none. */
const DEFAULT_MONITOR_TIMEOUT_MS = 300_000;

export interface AgentMonitor {
  /** A Monitor watch, or a shell command the agent runs in the background. */
  kind: "monitor" | "command";
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
    kind: "monitor",
    taskId,
    description: typeof input.description === "string" ? input.description : "",
    command: typeof input.command === "string" ? input.command : "",
    startedAt: new Date(startedAt).toISOString(),
    expiresAt: input.persistent === true ? null : new Date(startedAt + timeout).toISOString(),
  };
}

/** A shell command the agent started in the background: Bash answering with its task id. */
function startedBackgroundCommand(
  call: { status: unknown; detail: Record<string, unknown> },
  timestamp: string,
): AgentMonitor | null {
  if (call.status !== "completed") return null;
  const taskId = /Command running in background with ID: ([\w-]+)/.exec(
    JSON.stringify(call.detail.output ?? ""),
  )?.[1];
  const startedAt = Date.parse(timestamp);
  if (!taskId || Number.isNaN(startedAt)) return null;
  const input = isRecord(call.detail.input) ? call.detail.input : call.detail;
  return {
    kind: "command",
    taskId,
    description: typeof input.description === "string" ? input.description : "",
    command: typeof input.command === "string" ? input.command : "",
    startedAt: new Date(startedAt).toISOString(),
    expiresAt: null,
  };
}

/** A background command's end notice that names only its description: `Background command "…" completed`. */
function endedCommandDescription(call: {
  name: string;
  detail: Record<string, unknown>;
}): string | null {
  if (call.name !== "task_notification") return null;
  const label = typeof call.detail.label === "string" ? call.detail.label : "";
  return (
    /^Background command "(.*)" (?:completed|failed|was killed|was stopped|killed|stopped)/.exec(
      label,
    )?.[1] ?? null
  );
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
    const started = startedTask(call, row.timestamp);
    if (started) {
      monitors.set(started.taskId, started);
      continue;
    }
    const ended = endedTask(call);
    if (ended) monitors.delete(ended);
    const endedDescription = endedCommandDescription(call);
    if (endedDescription !== null) dropLatestCommand(monitors, endedDescription);
  }
  return [...monitors.values()].filter(
    (monitor) =>
      !stopped.has(monitor.taskId) &&
      Date.parse(monitor.startedAt) >= aliveSince.getTime() &&
      (monitor.expiresAt === null || Date.parse(monitor.expiresAt) > now.getTime()),
  );
}

/** A task a row starts: a Monitor watch, or a background shell command. */
function startedTask(
  call: { name: string; status: unknown; detail: Record<string, unknown> },
  timestamp: string,
): AgentMonitor | null {
  if (call.name === "Monitor") return startedMonitor(call, timestamp);
  if (call.name === "Bash") return startedBackgroundCommand(call, timestamp);
  return null;
}

/** Ends the latest background command with that description: its notice named nothing else. */
function dropLatestCommand(monitors: Map<string, AgentMonitor>, description: string): void {
  const latest = [...monitors.values()].findLast(
    (monitor) => monitor.kind === "command" && monitor.description === description,
  );
  if (latest) monitors.delete(latest.taskId);
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

/** A byte below the meta bit, as BSD `ps` draws it: `^X` for a control character, else itself. */
function visibleLowByte(byte: number): string {
  if (byte === 0x7f) return "^?";
  if (byte < 0x20) return `^${String.fromCharCode(byte + 0x40)}`;
  return String.fromCharCode(byte);
}

/** One byte of a command line as BSD `ps` (macOS) draws it. */
function visibleByte(byte: number): string {
  if (byte === 0x09 || byte === 0x0a || byte === 0xa0)
    return `\\${byte.toString(8).padStart(3, "0")}`;
  if (byte === 0x5c) return "\\\\";
  if (byte < 0x80) return visibleLowByte(byte);
  const low = byte & 0x7f;
  return low < 0x20 || low === 0x7f ? `M${visibleLowByte(low)}` : `M-${visibleLowByte(low)}`;
}

/**
 * A command as macOS `ps` lists it: a newline and a tab in octal (`\012`), a backslash doubled,
 * a control character as `^X` and each byte of a non-ASCII character in meta notation
 * (`Ж` is `M-PM^V`). Measured on macOS 15; a multi-line or non-ASCII command never matched its
 * shell without it.
 */
export function psVisible(text: string): string {
  let visible = "";
  for (const byte of new TextEncoder().encode(text)) visible += visibleByte(byte);
  return visible;
}

/**
 * The command a Claude Code shell runs: its wrapper ends in `eval '<command>' < /dev/null`, the
 * command single-quoted for the shell, a quote in it written `'\\''` or `'"'"'`. Null for a line
 * of another shape.
 */
export function evalledCommand(commandLine: string): string | null {
  const start = commandLine.indexOf(" eval '");
  const end = commandLine.lastIndexOf("' < /dev/null");
  if (start < 0 || end <= start) return null;
  return commandLine
    .slice(start + " eval '".length, end)
    .replaceAll("'\\''", "'")
    .replaceAll(`'"'"'`, "'");
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
  // `ps` lists the shell's line escaped (`psVisible`); a plain line is compared as it is.
  const wantedListed = collapse(psVisible(command));
  return processes
    .filter((row) => {
      if (!agentPids.has(row.ppid) || row.pid !== row.pgid || agentPids.has(row.pgid)) return false;
      const evalled = evalledCommand(row.command);
      if (evalled === null) return false;
      const listed = collapse(evalled);
      return listed === wanted || listed === wantedListed;
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
  const { processes, agentPids } = await agentProcessesOf(input.agentId, deps);
  const groups = monitorGroupsOf(processes, agentPids, input.monitor.command);
  for (const group of groups) deps.killGroup(group);
  if (groups.length > 0) STOPPED_MONITORS.add(input.monitor.taskId);
  return { stopped: groups.length > 0 };
}

/** This Mac's processes, and which of them are the agent's Claude Code processes. */
export async function agentProcessesOf(
  agentId: string,
  deps: Pick<MonitorStopDeps, "daemonPid" | "listProcesses" | "environmentOf">,
): Promise<{ processes: ProcessRow[]; agentPids: Set<number> }> {
  const processes = await deps.listProcesses();
  const agentPids = new Set<number>();
  for (const row of processes) {
    if (row.ppid !== deps.daemonPid || !/claude/.test(row.command)) continue;
    const environment = await deps.environmentOf(row.pid);
    if (environment.includes(`GROUPON_DESK_SESSION_ID=${agentId}`)) agentPids.add(row.pid);
  }
  return { processes, agentPids };
}

/**
 * The tasks whose process still runs under the agent's Claude Code process; none when that process
 * is gone, for its tasks went with it.
 */
export function aliveOnly(
  monitors: readonly AgentMonitor[],
  processes: readonly ProcessRow[],
  agentPids: ReadonlySet<number>,
): AgentMonitor[] {
  return monitors.filter(
    (monitor) => monitorGroupsOf(processes, agentPids, monitor.command).length > 0,
  );
}

/**
 * The workspaces where an agent has a task still running in the background, for the sidebar:
 * each agent's candidates from its timeline, checked against one listing of this Mac's processes.
 */
export async function backgroundWorkspaceIdsOf(
  agents: readonly { agentId: string; workspaceId: string; candidates: readonly AgentMonitor[] }[],
  deps: Pick<MonitorStopDeps, "daemonPid" | "listProcesses" | "environmentOf">,
): Promise<string[]> {
  const busy = agents.filter((agent) => agent.candidates.length > 0);
  if (busy.length === 0) return [];
  const processes = await deps.listProcesses();
  const listed = { ...deps, listProcesses: async () => processes };
  const workspaceIds = new Set<string>();
  for (const agent of busy) {
    if (workspaceIds.has(agent.workspaceId)) continue;
    const { agentPids } = await agentProcessesOf(agent.agentId, listed);
    if (aliveOnly(agent.candidates, processes, agentPids).length > 0) {
      workspaceIds.add(agent.workspaceId);
    }
  }
  return [...workspaceIds];
}

const run = promisify(execFile);
/** The environments of the agents' Claude Code processes, read once per process. */
const ENVIRONMENTS = new Map<number, string>();

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
      const known = ENVIRONMENTS.get(pid);
      if (known !== undefined) return known;
      try {
        const environment =
          process.platform === "linux"
            ? (await readFile(`/proc/${pid}/environ`, "utf8")).replaceAll("\0", " ")
            : (await run("ps", ["-wwE", "-o", "command=", "-p", String(pid)])).stdout;
        // A Claude Code process lives as long as its agent: read its environment once.
        if (ENVIRONMENTS.size > 256) ENVIRONMENTS.clear();
        ENVIRONMENTS.set(pid, environment);
        return environment;
      } catch {
        // A process that ended, or one this user may not read, is not the agent's.
        return "";
      }
    },
    killGroup: (pgid) => process.kill(-pgid, "SIGTERM"),
  };
}
