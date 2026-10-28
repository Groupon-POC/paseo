// Added for Groupon Desk (fork of Paseo, Apache-2.0): the Monitor watches an agent has running, as the composer's pill reads them.

/**
 * The daemon's answer to `groupon-desk.agent.monitors` (server `groupon/agent-monitors.ts`): each
 * watch the agent started with Claude Code's Monitor tool that still runs. The pill above the
 * composer counts them and its tooltip names each with the time it has left.
 *
 * Constraints:
 * - The answer crosses a process boundary and is checked before use; a watch without a task is dropped
 */

import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { GROUPON_MONITORS } from "./strings";

const GROUPON_DESK_RPC_PLUGIN_ID = "groupon-desk";
const AGENT_MONITORS_RPC = "groupon-desk.agent.monitors";

export interface AgentMonitor {
  taskId: string;
  description: string;
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

/** One watch in the tooltip: what it watches and how long it has left. */
export function monitorLine(monitor: AgentMonitor, now: number): string {
  const name = monitor.description || monitor.taskId;
  if (monitor.expiresAt === null) return `${name} · ${GROUPON_MONITORS.untilStopped}`;
  const minutes = Math.max(1, Math.ceil((Date.parse(monitor.expiresAt) - now) / 60_000));
  return `${name} · ${GROUPON_MONITORS.minutesLeft(minutes)}`;
}
