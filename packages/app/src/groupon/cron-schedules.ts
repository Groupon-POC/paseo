// Added for Groupon Desk (fork of Paseo, Apache-2.0).
/** Shared cron templates have one row; a handoff pauses every known copy before activating one. */
import type { AggregatedSchedule } from "@/schedules/aggregated-schedules";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { z } from "zod";
export const CronCatalogSchema = z.object({
  home: z.string(),
  jobs: z.array(z.object({ name: z.string(), scheduleId: z.string() })),
});
export interface CronIdentity {
  name: string;
  home: string;
}
export interface CronScheduleGroup {
  schedule: AggregatedSchedule;
  copies: AggregatedSchedule[];
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function portableCron(schedule: AggregatedSchedule): boolean {
  return Boolean(
    schedule.cron &&
    schedule.target.type === "new-agent" &&
    schedule.target.config.cwd === schedule.cron.home &&
    schedule.target.config.systemPrompt?.startsWith(
      'You are run unattended by `groupon cron` as the job "',
    ),
  );
}
export function groupCronSchedules(schedules: readonly AggregatedSchedule[]): CronScheduleGroup[] {
  const groups = new Map<string, AggregatedSchedule[]>();
  for (const schedule of schedules) {
    let key = `${schedule.serverId}:${schedule.id}`;
    if (portableCron(schedule) && schedule.target.type === "new-agent") {
      const { cwd: _cwd, systemPrompt, ...config } = schedule.target.config;
      // Only the CLI's generated first line changes with an adopted copy's local slug.
      const instructions = systemPrompt?.replace(
        /^You are run unattended by `groupon cron` as the job "[^"\n]+", on a schedule\./,
        "Groupon scheduled job.",
      );
      key = stable({
        name: schedule.name,
        prompt: schedule.prompt,
        cadence: schedule.cadence,
        config,
        instructions,
        maxRuns: schedule.maxRuns,
        expiresAt: schedule.expiresAt,
      });
    }
    const copies = groups.get(key) ?? [];
    copies.push(schedule);
    groups.set(key, copies);
  }
  return [...groups.values()].map((copies) => ({
    copies,
    schedule: [...copies].sort(
      (a, b) =>
        Number(b.status === "active") - Number(a.status === "active") ||
        Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
        a.serverId.localeCompare(b.serverId) ||
        a.id.localeCompare(b.id),
    )[0]!,
  }));
}
const changingGroups = new Set<string>();
export async function placeCronGroup(input: {
  copies: readonly AggregatedSchedule[];
  target: AggregatedSchedule | null;
  getClient: (serverId: string) => Pick<DaemonClient, "invokePluginRpc"> | null;
  isOnline: (serverId: string) => boolean;
  allHostsLoaded: boolean;
}) {
  const key = input.copies
    .map((copy) => `${copy.serverId}:${copy.id}`)
    .sort()
    .join("|");
  if (changingGroups.has(key))
    throw new Error("This cron is already changing computers. Wait for that change to finish.");
  changingGroups.add(key);
  try {
    if (!input.allHostsLoaded)
      throw new Error(
        "Connect all your computers before changing where this shared cron runs, so every old copy can be stopped first.",
      );
    if (
      input.target &&
      !input.copies.some(
        (copy) => copy.serverId === input.target!.serverId && copy.id === input.target!.id,
      )
    )
      throw new Error("Choose a computer that holds this cron.");
    const clients = new Map<string, Pick<DaemonClient, "invokePluginRpc">>();
    for (const copy of input.copies) {
      const client = input.getClient(copy.serverId);
      if (!copy.cron || !input.isOnline(copy.serverId) || !client)
        throw new Error(`${copy.serverName} must be connected before moving this cron.`);
      clients.set(copy.serverId, client);
    }
    const place = async (copy: AggregatedSchedule, active: boolean) => {
      const response = await clients
        .get(copy.serverId)!
        .invokePluginRpc("groupon", "groupon.cron-place", { scheduleId: copy.id, active });
      if (!z.object({ shared: z.literal(true) }).safeParse(response).success)
        throw new Error("The cron placement has not been shared with the other computers.");
    };
    // A failure stops here: never activate the destination without acknowledgments from all copies.
    for (const copy of input.copies) await place(copy, false);
    if (input.target) await place(input.target, true);
  } finally {
    changingGroups.delete(key);
  }
}

/** Update every copy with the same definition while preserving each Mac's home directory. */
export async function updateCronCopies(input: {
  copies: readonly AggregatedSchedule[];
  update: import("@getpaseo/client/internal/daemon-client").UpdateScheduleOptions;
  getClient: (serverId: string) => Pick<DaemonClient, "scheduleUpdate"> | null;
}) {
  const clients = input.copies.map((copy) => {
    const client = input.getClient(copy.serverId);
    if (!client || !portableCron(copy))
      throw new Error(`${copy.serverName} must be connected to edit this shared cron.`);
    return client;
  });
  for (const [index, copy] of input.copies.entries()) {
    const answer = await clients[index]!.scheduleUpdate({
      ...input.update,
      id: copy.id,
      ...(input.update.newAgentConfig
        ? { newAgentConfig: { ...input.update.newAgentConfig, cwd: copy.cron!.home } }
        : {}),
    });
    if (answer.error) throw new Error(`${copy.serverName}: ${answer.error}`);
  }
}

/** Delete every template copy after stopping it, through the CLI's durable removal path. */
export async function removeCronCopies(input: Parameters<typeof placeCronGroup>[0]) {
  await placeCronGroup({ ...input, target: null });
  for (const copy of input.copies) {
    const answer = await input
      .getClient(copy.serverId)!
      .invokePluginRpc("groupon", "groupon.cron-remove", { scheduleId: copy.id });
    if (!z.object({ removed: z.literal(true) }).safeParse(answer).success)
      throw new Error(`${copy.serverName}: the cron could not be removed.`);
  }
}
