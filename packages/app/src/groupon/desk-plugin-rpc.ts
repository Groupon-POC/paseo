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
  githubRepositories: "groupon.github-repositories",
  ticketStart: "groupon.ticket-start",
  job: "groupon.job",
  ticketFlow: "groupon.ticket-flow",
  projectSettings: "groupon.project-settings",
  encoreState: "groupon.encore-state",
  requestEncoreAccess: "groupon.encore-request-access",
  jiraSearch: "groupon.jira-search",
  jiraFields: "groupon.jira-fields",
  jiraSavedView: "groupon.jira-saved-view",
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

/** A GitHub host and the account gh is signed in to there; `signIn` is the command when it is not. */
export interface GithubHost {
  host: string;
  login: string | null;
  signIn: string | null;
}

export interface GithubAccessAnswer {
  /** The host this answer is for; a plugin older than the host switch leaves it out (github.com). */
  host?: string;
  /** github.com and github.groupondev.com, then any other host gh is signed in to; absent from an older plugin. */
  hosts?: GithubHost[];
  access: {
    githubLogin: string | null;
    requestAccessUrl: string | null;
    organisations: GithubOrganisation[];
    /** Every other organisation on an enterprise host, whose visible repositories may be cloned; null on github.com. */
    otherOrganisations?: string[] | null;
  } | null;
  problem: string | null;
  readAt: string | null;
  defaultFolder: string;
}

export interface GithubRepositoriesAnswer {
  repositories: GithubRepository[] | null;
  problem: string | null;
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

export interface EncoreRollout {
  rolloutId: string;
  /** Encore Cloud's status: pending, queued, running, completed. */
  status: string;
  /** pending until completed, then success, failure, canceled. */
  conclusion: string;
  commitShort: string | null;
  queuedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  dashboardUrl: string;
}

export type EncoreStanding = "member" | "invited" | "not-member" | "unknown" | "not-handed-out";

export interface EncoreAppState {
  key: string;
  slug: string;
  name: string;
  standing: EncoreStanding;
  role: string | null;
  requestPending: boolean | null;
  approver: string | null;
  environments: { environment: string; rollout: EncoreRollout | null }[];
}

export interface ReleaseTrain {
  number: number;
  title: string;
  url: string;
  checks: "passing" | "failing" | "pending" | "none";
  createdAt: string | null;
}

/** A project's Encore card, as the plugin's `groupon.encore-state` answers it. */
export interface EncoreStateAnswer {
  configured: boolean;
  apps: EncoreAppState[];
  appsProblem: string | null;
  releases: { base: string } | null;
  train: ReleaseTrain | null;
  trainProblem: string | null;
  fileProblems: string[];
  environment: string | null;
  readAt: string;
}

export interface EncoreAccessAnswer {
  slug: string;
  state: "filed" | "already-waiting" | "failed";
  message: string;
}

/** A Jira field a My tasks column can show. `kind` says how its cells read (`datetime`, `status`, `user`...). */
export interface JiraField {
  id: string;
  name: string;
  kind: string;
  custom: boolean;
  sortable: boolean;
  clauseName: string | null;
}

export interface JiraCell {
  text: string;
  iconUrl: string | null;
  url: string | null;
  /** A status's grouping: todo, in_progress, done; null on any other cell. */
  category: string | null;
}

export interface JiraRow {
  key: string;
  url: string;
  cells: Record<string, JiraCell>;
}

export interface JiraSearchPage {
  data: JiraRow[];
  nextCursor: string | null;
  total: number | null;
  fields: JiraField[];
  /** The query as Jira ran it, the platform's scope included. */
  jql: string;
}

/** Why a My tasks read gave nothing: the CLI on that Mac is signed out, or anything else. */
export interface JiraProblem {
  kind: "signed-out" | "failed";
  message: string;
}

export interface JiraSavedView {
  jql: string;
  columns: string[];
  updatedAt: string;
}

export interface JiraSearchAnswer {
  page: JiraSearchPage | null;
  problem: JiraProblem | null;
}

export interface JiraFieldsAnswer {
  fields: JiraField[] | null;
  problem: JiraProblem | null;
}

export interface JiraSavedViewAnswer {
  view: JiraSavedView | null;
  problem: JiraProblem | null;
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

export function isGithubRepositoriesAnswer(value: unknown): value is GithubRepositoriesAnswer {
  return isRecord(value) && (value.repositories === null || Array.isArray(value.repositories));
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

export function isEncoreStateAnswer(value: unknown): value is EncoreStateAnswer {
  return (
    isRecord(value) &&
    typeof value.configured === "boolean" &&
    Array.isArray(value.apps) &&
    value.apps.every(
      (app) => isRecord(app) && typeof app.slug === "string" && Array.isArray(app.environments),
    ) &&
    Array.isArray(value.fileProblems) &&
    (value.train === null || (isRecord(value.train) && typeof value.train.url === "string"))
  );
}

export function isEncoreAccessAnswer(value: unknown): value is EncoreAccessAnswer {
  return (
    isRecord(value) &&
    typeof value.slug === "string" &&
    (value.state === "filed" || value.state === "already-waiting" || value.state === "failed") &&
    typeof value.message === "string"
  );
}

const isJiraProblem = (value: unknown): value is JiraProblem | null =>
  value === null ||
  (isRecord(value) &&
    (value.kind === "signed-out" || value.kind === "failed") &&
    typeof value.message === "string");

const isJiraField = (value: unknown): value is JiraField =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  typeof value.kind === "string";

const isJiraRow = (value: unknown): value is JiraRow =>
  isRecord(value) &&
  typeof value.key === "string" &&
  typeof value.url === "string" &&
  isRecord(value.cells) &&
  Object.values(value.cells).every((cell) => isRecord(cell) && typeof cell.text === "string");

export function isJiraSearchAnswer(value: unknown): value is JiraSearchAnswer {
  if (!isRecord(value) || !isJiraProblem(value.problem)) return false;
  const page = value.page;
  if (page === null) return true;
  return (
    isRecord(page) &&
    Array.isArray(page.data) &&
    page.data.every(isJiraRow) &&
    Array.isArray(page.fields) &&
    page.fields.every(isJiraField) &&
    (page.nextCursor === null || typeof page.nextCursor === "string") &&
    (page.total === null || typeof page.total === "number")
  );
}

export function isJiraFieldsAnswer(value: unknown): value is JiraFieldsAnswer {
  return (
    isRecord(value) &&
    isJiraProblem(value.problem) &&
    (value.fields === null || (Array.isArray(value.fields) && value.fields.every(isJiraField)))
  );
}

export function isJiraSavedViewAnswer(value: unknown): value is JiraSavedViewAnswer {
  if (!isRecord(value) || !isJiraProblem(value.problem)) return false;
  const view = value.view;
  return (
    view === null ||
    (isRecord(view) &&
      typeof view.jql === "string" &&
      Array.isArray(view.columns) &&
      view.columns.every((column) => typeof column === "string"))
  );
}

function jobIdOf(output: Record<string, unknown>, method: string): string {
  if (typeof output.jobId !== "string") throw new Error(`${method} answered no job id`);
  return output.jobId;
}

export async function readGithubAccess(
  client: PluginRpcClient,
  host: string,
  refresh: boolean,
): Promise<GithubAccessAnswer> {
  const output = await call(client, GROUPON_RPC.githubAccess, { refresh, host });
  if (!isGithubAccessAnswer(output))
    throw new Error("The GitHub access came back in a shape this app does not read");
  return output;
}

/** One organisation's visible repositories on an enterprise host. */
export async function readGithubRepositories(
  client: PluginRpcClient,
  host: string,
  organisation: string,
  refresh: boolean,
): Promise<GithubRepositoriesAnswer> {
  const output = await call(client, GROUPON_RPC.githubRepositories, {
    host,
    organisation,
    refresh,
  });
  if (!isGithubRepositoriesAnswer(output))
    throw new Error("The repositories came back in a shape this app does not read");
  return output;
}

export async function startGithubClone(
  client: PluginRpcClient,
  host: string,
  fullName: string,
  folder: string,
): Promise<string> {
  return jobIdOf(
    await call(client, GROUPON_RPC.githubClone, { fullName, folder, host }),
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

export async function readEncoreState(
  client: PluginRpcClient,
  projectRoot: string,
): Promise<EncoreStateAnswer> {
  const output = await call(client, GROUPON_RPC.encoreState, { projectRoot });
  if (!isEncoreStateAnswer(output))
    throw new Error("The Encore card came back in a shape this app does not read");
  return output;
}

/** Files the person's request for developer access to one Encore app (the /encore-onboarding request). */
export async function requestEncoreAccess(
  client: PluginRpcClient,
  slug: string,
): Promise<EncoreAccessAnswer> {
  const output = await call(client, GROUPON_RPC.requestEncoreAccess, { slug });
  if (!isEncoreAccessAnswer(output))
    throw new Error("The access request came back in a shape this app does not read");
  return output;
}

/** One page of the person's Jira search, run by the platform inside its scope. */
export async function searchJira(
  client: PluginRpcClient,
  input: { jql: string; fields: string[]; cursor: string | null; limit: number },
): Promise<JiraSearchAnswer> {
  const output = await call(client, GROUPON_RPC.jiraSearch, { ...input });
  if (!isJiraSearchAnswer(output))
    throw new Error("The Jira search came back in a shape this app does not read");
  return output;
}

/** The Jira fields a column can show. */
export async function readJiraFields(
  client: PluginRpcClient,
  refresh: boolean,
): Promise<JiraFieldsAnswer> {
  const output = await call(client, GROUPON_RPC.jiraFields, { refresh });
  if (!isJiraFieldsAnswer(output))
    throw new Error("The Jira fields came back in a shape this app does not read");
  return output;
}

/** The person's saved My tasks view; with `save`, saved over first. */
export async function jiraSavedView(
  client: PluginRpcClient,
  save?: { jql: string; columns: string[] },
): Promise<JiraSavedViewAnswer> {
  const output = await call(client, GROUPON_RPC.jiraSavedView, save ? { save } : {});
  if (!isJiraSavedViewAnswer(output))
    throw new Error("The saved view came back in a shape this app does not read");
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
