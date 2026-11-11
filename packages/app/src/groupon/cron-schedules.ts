// Added for Groupon Desk (fork of Paseo, Apache-2.0).
/**
 * Shared cron templates have one row; a handoff pauses every known copy before activating one. A
 * cron with a repository (`groupon cron edit --repository`) works in worktrees of each Mac's own
 * checkout, runs only on a Mac holding one, and has its repository set through the copy's Mac.
 */
import type { AggregatedSchedule } from "@/schedules/aggregated-schedules";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { z } from "zod";
import { GROUPON_PLUGIN_ID, GROUPON_RPC } from "@/groupon/desk-plugin-rpc";
export const CronCatalogSchema = z.object({
  home: z.string(),
  /** This Mac's hub id; absent from a plugin older than repositories. */
  machine: z.string().nullable().optional(),
  jobs: z.array(
    z.object({
      name: z.string(),
      scheduleId: z.string(),
      repository: z.string().nullable().optional(),
    }),
  ),
});
export const CronRepositoriesSchema = z.object({
  repositories: z.array(
    z.object({
      repository: z.string(),
      name: z.string(),
      checkouts: z.array(z.object({ machine: z.string(), rootPath: z.string() })),
    }),
  ),
});
export type CronRepository = z.infer<typeof CronRepositoriesSchema>["repositories"][number];
export interface CronIdentity {
  name: string;
  home: string;
  /** The repository its runs work in (`github.com/org/repo`); null or absent: the home folder. */
  repository?: string | null;
  /** The hub id of the Mac this copy is on. */
  machine?: string | null;
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
  if (!schedule.cron || schedule.target.type !== "new-agent") return false;
  const config = schedule.target.config;
  // Each Mac's own folder: its home, or for a repository cron its checkout, a worktree per run.
  const ownFolder = schedule.cron.repository
    ? config.isolation === "worktree"
    : config.cwd === schedule.cron.home;
  return Boolean(
    ownFolder &&
    config.systemPrompt?.startsWith('You are run unattended by `groupon cron` as the job "'),
  );
}

/** The folder a copy's runs work in on its own Mac: its checkout of the repository, or its home. */
function ownFolderOf(copy: AggregatedSchedule): string {
  return copy.target.type === "new-agent" ? copy.target.config.cwd : copy.cron!.home;
}

/** The copies that may run the cron: all of them, or for a repository cron those on a Mac holding a checkout of it. */
export function copiesHoldingRepository(
  copies: readonly AggregatedSchedule[],
  repositories: readonly CronRepository[],
): AggregatedSchedule[] {
  return copies.filter((copy) => {
    const repository = copy.cron?.repository;
    if (!repository) return true;
    const held = repositories.find((entry) => entry.repository === repository);
    return Boolean(held?.checkouts.some((checkout) => checkout.machine === copy.cron?.machine));
  });
}

/** The repository a cron works in, set (or cleared with null) through its copy's own Mac; the CLI's refusal is the error. */
export async function setCronRepository(input: {
  copy: AggregatedSchedule;
  repository: string | null;
  client: Pick<DaemonClient, "invokePluginRpc">;
}): Promise<void> {
  await input.client.invokePluginRpc(GROUPON_PLUGIN_ID, GROUPON_RPC.cronRepository, {
    scheduleId: input.copy.id,
    repository: input.repository,
  });
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

/** Update every copy with the same definition while preserving each Mac's own folder (its home, or its checkout). */
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
        ? { newAgentConfig: { ...input.update.newAgentConfig, cwd: ownFolderOf(copy) } }
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

/** The repositories a cron may work in and the Macs holding each, asked of one Mac's plugin (the hub's view). */
export async function readCronRepositories(
  client: Pick<DaemonClient, "invokePluginRpc">,
): Promise<CronRepository[]> {
  const answer = CronRepositoriesSchema.safeParse(
    await client.invokePluginRpc(GROUPON_PLUGIN_ID, GROUPON_RPC.cronRepositories, {}),
  );
  if (!answer.success)
    throw new Error("Update Groupon Desk on this computer to choose a repository.");
  return answer.data.repositories;
}
