// Added for Groupon Desk (fork of Paseo, Apache-2.0): the Monitor watches an agent has running, as the composer's pill reads them.

/**
 * The daemon's answer to `groupon-desk.agent.monitors` (server `groupon/agent-monitors.ts`): each
 * watch the agent started with Claude Code's Monitor tool that still runs. The pill above the
 * composer counts them; its panel names each with its command and the time it has left, and stops one.
 *
 * Constraints:
 * - The answer crosses a process boundary and is checked before use; a watch without a task is dropped
 */

import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { GROUPON_MONITORS } from "./strings";

const GROUPON_DESK_RPC_PLUGIN_ID = "groupon-desk";
const AGENT_MONITORS_RPC = "groupon-desk.agent.monitors";
const AGENT_MONITOR_STOP_RPC = "groupon-desk.agent.monitor.stop";

export interface AgentMonitor {
  taskId: string;
  description: string;
  /** The command it watches. */
  command: string;
  startedAt: string;
  /** Null for a watch that runs until it is stopped. */
  expiresAt: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function monitorOf(value: unknown): AgentMonitor | null {
  if (!isRecord(value) || typeof value.taskId !== "string" || value.taskId.length === 0) {
    return null;
  }
  return {
    taskId: value.taskId,
    description: typeof value.description === "string" ? value.description : "",
    command: typeof value.command === "string" ? value.command : "",
    startedAt: typeof value.startedAt === "string" ? value.startedAt : "",
    expiresAt: typeof value.expiresAt === "string" ? value.expiresAt : null,
  };
}

/** The daemon's answer, checked: the agent's running watches, oldest first. */
export async function readAgentMonitors(
  client: Pick<DaemonClient, "invokePluginRpc">,
  agentId: string,
): Promise<AgentMonitor[]> {
  const answer = await client.invokePluginRpc(GROUPON_DESK_RPC_PLUGIN_ID, AGENT_MONITORS_RPC, {
    agentId,
  });
  const monitors = isRecord(answer) && Array.isArray(answer.monitors) ? answer.monitors : [];
  return monitors.map(monitorOf).filter((monitor): monitor is AgentMonitor => monitor !== null);
}

/** The watches not yet past their end at `now`: the daemon's answer may be a few seconds old. */
export function runningMonitors(monitors: readonly AgentMonitor[], now: number): AgentMonitor[] {
  return monitors.filter(
    (monitor) => monitor.expiresAt === null || Date.parse(monitor.expiresAt) > now,
  );
}

/** The pill's words: "1 monitor", "3 monitors". */
export function monitorsPillLabel(count: number): string {
  return `${count} ${count === 1 ? GROUPON_MONITORS.one : GROUPON_MONITORS.many}`;
}

/** How long a watch has left at `now`: minutes, the last minute in seconds, or until stopped. */
export function monitorTimeLeft(monitor: AgentMonitor, now: number): string {
  if (monitor.expiresAt === null) return GROUPON_MONITORS.untilStopped;
  const seconds = Math.max(0, Math.ceil((Date.parse(monitor.expiresAt) - now) / 1000));
  if (seconds < 60) return GROUPON_MONITORS.secondsLeft(seconds);
  return GROUPON_MONITORS.minutesLeft(Math.ceil(seconds / 60));
}

/** Asks the daemon to stop one of the agent's watches; whether it found it running. */
export async function stopAgentMonitor(
  client: Pick<DaemonClient, "invokePluginRpc">,
  agentId: string,
  taskId: string,
): Promise<boolean> {
  const answer = await client.invokePluginRpc(GROUPON_DESK_RPC_PLUGIN_ID, AGENT_MONITOR_STOP_RPC, {
    agentId,
    taskId,
  });
  return isRecord(answer) && answer.stopped === true;
}
