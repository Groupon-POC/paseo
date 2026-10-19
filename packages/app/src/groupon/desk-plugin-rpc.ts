// Added for Groupon Desk (fork of Paseo, Apache-2.0): the Groupon plugin's RPCs as the app calls them.

/**
 * The Groupon plugin runs inside the daemon on each of the person's Macs (monorepo
 * `packages/desk-paseo-plugin`, loaded by `groupon desk serve`). Its daemon side answers these
 * methods through Paseo's plugin RPC, with the CLI's own session on that Mac, so the app makes no
 * Groupon call for them and needs no CORS allowance on the internal plane.
 *
 * The names and shapes are the plugin's `shared/rpc.ts`; its `tests/rpc.test.ts` and this file's
 * test hold the same sample answers. Anything slower than Paseo's 60-second RPC (a download, a
 * readiness grading) answers a job id, followed with `groupon.job`.
 */

import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";

export const GROUPON_PLUGIN_ID = "groupon";

export const GROUPON_RPC = {
  githubAccess: "groupon.github-access",
  githubClone: "groupon.github-clone",
  ticketStart: "groupon.ticket-start",
  job: "groupon.job",
  ticketFlow: "groupon.ticket-flow",
  projectSettings: "groupon.project-settings",
} as const;

export type PluginRpcClient = Pick<DaemonClient, "invokePluginRpc">;

export interface GithubRepository {
  name: string;
  fullName: string;
  description: string | null;
  isPrivate: boolean;
  permission: string | null;
}

export interface GithubTeam {
  slug: string;
  name: string;
  description: string | null;
  repositories: GithubRepository[] | null;
}

export interface GithubOrganisation {
  login: string;
  purpose: string;
  membership: string;
  teams: GithubTeam[];
}

export interface GithubAccessAnswer {
  access: {
    githubLogin: string | null;
    requestAccessUrl: string | null;
    organisations: GithubOrganisation[];
  } | null;
  problem: string | null;
  readAt: string | null;
  defaultFolder: string;
}

export type TicketOutcome =
  | {
      kind: "started";
      ticket: string;
      branch: string;
      readiness: string;
      workspaceId: string;
      agentId: string | null;
    }
  | {
      kind: "handed-back";
      ticket: string;
      reason: string;
      questions: { label: string; note: string }[];
      link: string;
    };

export interface JobAnswer {
  jobId: string;
  kind: "github-clone" | "ticket-start";
  status: "running" | "done" | "failed";
  phase: string;
  error: string | null;
  clone: { checkoutPath: string; alreadyThere: boolean } | null;
  ticket: TicketOutcome | null;
  updatedAt: string;
}

export interface RepositoryRunScript {
  id: string;
  command: string;
  icon: string | null;
  isDefault: boolean;
}

export interface ProjectSettingsAnswer {
  settings: {
    setup: string | null;
    archive: string | null;
    runMode: "concurrent" | "nonconcurrent";
    run: RepositoryRunScript[];
    prompts: Record<string, string>;
    targetBranch: string | null;
    deleteBranchOnArchive: boolean;
    envRequired: string[];
  } | null;
  source: "default-branch" | "checkout" | "none";
  branch: string | null;
  fileUrl: string | null;
  fetchedAt: string | null;
  problem: string | null;
}

export interface TicketStartInput {
  ticket: string;
  projectRoot: string;
  projectId?: string;
  provider: string;
  model: string;
  thinkingOptionId?: string;
  modeId?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The daemon's own words for a missing plugin or method (`PluginRuntime.invoke`: "Plugin is not
 * available: groupon", "Plugin groupon does not contribute RPC ..."), said as what to do.
 */
export function pluginProblemText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("Plugin is not available")) {
    return "This Mac's daemon has no Groupon plugin: run it with groupon desk serve.";
  }
  if (/does not contribute RPC/.test(message)) {
    return "The Groupon plugin on this Mac is older than this app: restart groupon desk serve there.";
  }
  return message;
}

async function call(
  client: PluginRpcClient,
  method: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const output = await client.invokePluginRpc(GROUPON_PLUGIN_ID, method, input);
  if (!isRecord(output)) throw new Error(`${method} answered something that is not an object`);
  return output;
}

export function isGithubAccessAnswer(value: unknown): value is GithubAccessAnswer {
  return (
    isRecord(value) &&
    typeof value.defaultFolder === "string" &&
    (value.access === null || (isRecord(value.access) && Array.isArray(value.access.organisations)))
  );
}

export function isJobAnswer(value: unknown): value is JobAnswer {
  return (
    isRecord(value) &&
    typeof value.jobId === "string" &&
    (value.status === "running" || value.status === "done" || value.status === "failed") &&
    typeof value.phase === "string"
  );
}

export function isProjectSettingsAnswer(value: unknown): value is ProjectSettingsAnswer {
  return (
    isRecord(value) &&
    (value.source === "default-branch" || value.source === "checkout" || value.source === "none") &&
    (value.settings === null || (isRecord(value.settings) && Array.isArray(value.settings.run)))
  );
}

function jobIdOf(output: Record<string, unknown>, method: string): string {
  if (typeof output.jobId !== "string") throw new Error(`${method} answered no job id`);
  return output.jobId;
}

export async function readGithubAccess(
  client: PluginRpcClient,
  refresh: boolean,
): Promise<GithubAccessAnswer> {
  const output = await call(client, GROUPON_RPC.githubAccess, { refresh });
  if (!isGithubAccessAnswer(output))
    throw new Error("The GitHub access came back in a shape this app does not read");
  return output;
}

export async function startGithubClone(
  client: PluginRpcClient,
  fullName: string,
  folder: string,
): Promise<string> {
  return jobIdOf(
    await call(client, GROUPON_RPC.githubClone, { fullName, folder }),
    GROUPON_RPC.githubClone,
  );
}

export async function startTicketJob(
  client: PluginRpcClient,
  input: TicketStartInput,
): Promise<string> {
  return jobIdOf(
    await call(client, GROUPON_RPC.ticketStart, { ...input }),
    GROUPON_RPC.ticketStart,
  );
}

export async function readJob(client: PluginRpcClient, jobId: string): Promise<JobAnswer> {
  const output = await call(client, GROUPON_RPC.job, { jobId });
  if (!isJobAnswer(output))
    throw new Error("The job's state came back in a shape this app does not read");
  return output;
}

export async function readProjectSettings(
  client: PluginRpcClient,
  projectRoot: string,
  refresh: boolean,
): Promise<ProjectSettingsAnswer> {
  const output = await call(client, GROUPON_RPC.projectSettings, { projectRoot, refresh });
  if (!isProjectSettingsAnswer(output))
    throw new Error("The repository file came back in a shape this app does not read");
  return output;
}

/** How often a running job is asked where it stands. */
export const JOB_POLL_MS = 1500;

/**
 * Follows a job until it ends: each answer goes to `onPhase`; the last one is returned. Stops
 * early (null) when `isLive` turns false, so a closed sheet stops asking.
 */
export async function followJob(
  client: PluginRpcClient,
  jobId: string,
  onPhase: (job: JobAnswer) => void,
  isLive: () => boolean,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<JobAnswer | null> {
  for (;;) {
    if (!isLive()) return null;
    const job = await readJob(client, jobId);
    onPhase(job);
    if (job.status !== "running") return job;
    await sleep(JOB_POLL_MS);
  }
}
