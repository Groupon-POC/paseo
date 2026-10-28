// Added for Groupon Desk (fork of Paseo, Apache-2.0): the Monitor watches an agent has running, read from its timeline.

/**
 * Claude Code's Monitor tool starts a background watch that wakes the agent on each line of a
 * command's output. The window shows which watches an agent has running, beside Share above the
 * composer; this reads them from the agent's timeline: a completed Monitor call whose answer names
 * its task, not yet ended by a TaskStop of that task, a task notification carrying an end status,
 * its timeout, or the end of the daemon process the agent ran under.
 *
 * Constraints:
 * - Read-only over the timeline; the watch itself lives in the agent's Claude Code process
 */

/** The Groupon Desk plugin RPC the window calls: `{ agentId }`, answered `{ monitors }`. */
export const AGENT_MONITORS_RPC = "groupon-desk.agent.monitors";

/** Claude Code's default Monitor timeout when the call names none. */
const DEFAULT_MONITOR_TIMEOUT_MS = 300_000;

export interface AgentMonitor {
  taskId: string;
  description: string;
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
      Date.parse(monitor.startedAt) >= aliveSince.getTime() &&
      (monitor.expiresAt === null || Date.parse(monitor.expiresAt) > now.getTime()),
  );
}
