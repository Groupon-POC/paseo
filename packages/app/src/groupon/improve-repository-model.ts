// Added for Groupon Desk (fork of Paseo, Apache-2.0): Improve this repository's choices, as plain data.

/**
 * Improve this repository (owner, 2026-10-20: "a prompt that tunes a repository so it adapts
 * easily to a person"): the repository, the Mac that holds it, the agent, and the one prompt sent.
 * Pure, so the rules are tested without a screen.
 *
 * Responsibilities:
 * - `requestedRepositoryId`: the repository the sheet opens on (the row or page it was opened
 *   from, else where the person is, else the repository chosen last)
 * - `improveMacs`, `improveMacServerId`, `improveChosenMac`, `improveMacProblem`: only Macs holding the repository;
 *   only a serving one (its hand running) can be chosen; why none can
 * - `improvePrompt`: the repository's `[prompts] improve_repository`, else the window's default
 * - `improveAgent`: the agent and model New workspace used last when this Mac offers them
 * - `improveStartProblem`: why Start cannot run yet
 * - `improveWorkspaceRequest`: the workspace Start creates, in the worktree `improve-repository`
 *
 * Constraints:
 * - Nothing starts on a Mac whose hand is not running: the same rule as New workspace's Mac
 *   picker and Start a ticket (`MacPickerOption.selectable`)
 */

import type { CreateWorkspaceRequestOptions } from "@getpaseo/client/internal/daemon-client";
import type { ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";
import type { HostProjectListItem } from "@/projects/host-project-model";
import type { ProjectSettingsAnswer } from "./desk-plugin-rpc";
import type { MacPickerOption } from "./mac-picker-model";
import {
  checkoutOnMac,
  entryOfProject,
  preselectedRepositoryId,
  type RepositoryCheckout,
  type RepositoryEntry,
} from "./repository-picker-model";
import {
  agentChoices,
  defaultEffortId,
  defaultModelId,
  selectableModels,
} from "./start-ticket-model";
import { GROUPON_IMPROVE } from "./strings";

/** The worktree (and its first branch name) every run starts in. */
export const IMPROVE_WORKTREE_SLUG = "improve-repository";

/** The key under `[prompts]` in `.groupon/desk.toml` that replaces the default prompt. */
export const IMPROVE_PROMPT_KEY = "improve_repository";

/** Where the sheet was opened from: a sidebar row, the Projects page, or nowhere in particular. */
export interface ImproveRequestContext {
  projectViewKey?: string | null;
  serverId?: string | null;
  path?: string | null;
}

/**
 * The repository the sheet opens on: the project it was opened from (by its view key, else by the
 * checkout's Mac and path), else New workspace's own preselection (where the person is, else the
 * repository chosen last); null when nothing says.
 */
export function requestedRepositoryId(input: {
  entries: readonly RepositoryEntry[];
  projects: readonly HostProjectListItem[];
  context: ImproveRequestContext;
  lastActiveProject: HostProjectListItem | null;
  lastRepositoryId: string | null;
}): string | null {
  const { entries, context } = input;
  const viewKey = context.projectViewKey ?? null;
  const fromRow = viewKey
    ? entryOfProject(entries, input.projects.find((project) => project.viewKey === viewKey) ?? null)
    : null;
  if (fromRow) return fromRow.id;
  const path = context.path ?? null;
  if (path) {
    const matches = (checkout: RepositoryCheckout) =>
      checkout.path === path && (!context.serverId || checkout.serverId === context.serverId);
    const byPath = entries.find((entry) => entry.checkouts.some(matches));
    if (byPath) return byPath.id;
  }
  return preselectedRepositoryId({
    entries,
    routeProject: null,
    lastActiveProject: input.lastActiveProject,
    lastRepositoryId: input.lastRepositoryId,
  });
}

/** A Mac that holds the repository, as the sheet lists it. */
export interface ImproveMac {
  mac: MacPickerOption;
  checkout: RepositoryCheckout;
}

/** The Macs holding the repository, in the Mac picker's order (this Mac first). */
export function improveMacs(
  entry: RepositoryEntry | null,
  macs: readonly MacPickerOption[],
): ImproveMac[] {
  if (!entry) return [];
  return macs.flatMap((mac) => {
    const checkout = checkoutOnMac(entry, mac);
    return checkout ? [{ mac, checkout }] : [];
  });
}

/**
 * The Mac to start on: the one asked for when it holds the repository and serves, else this Mac
 * when it does, else the first that does; null when no Mac holding it is serving.
 */
export function improveMacServerId(
  holding: readonly ImproveMac[],
  wanted: string | null,
): string | null {
  const serving = holding.filter((row) => row.mac.selectable && row.mac.serverId !== null);
  const asked = wanted ? serving.find((row) => row.mac.serverId === wanted) : undefined;
  const chosen = asked ?? serving.find((row) => row.mac.isThisMac) ?? serving[0];
  return chosen?.mac.serverId ?? null;
}

/** The chosen Mac's row; none without a serving Mac (a Mac without a hand has no server id either). */
export function improveChosenMac(
  holding: readonly ImproveMac[],
  serverId: string | null,
): ImproveMac | null {
  if (serverId === null) return null;
  return holding.find((row) => row.mac.selectable && row.mac.serverId === serverId) ?? null;
}

/** Why no Mac can take the run: none holds the repository, or none holding it is serving. */
export function improveMacProblem(
  entry: RepositoryEntry | null,
  holding: readonly ImproveMac[],
): string | null {
  if (!entry) return GROUPON_IMPROVE.chooseRepository;
  if (holding.length === 0) return GROUPON_IMPROVE.notOnAnyMac(entry.label);
  if (holding.some((row) => row.mac.selectable && row.mac.serverId !== null)) return null;
  const macs = holding.map((row) => row.mac.label).join(", ");
  return GROUPON_IMPROVE.noMacServing(entry.label, macs);
}

export interface ImprovePrompt {
  text: string;
  source: "repository" | "default";
}

/** The repository's own `[prompts] improve_repository` when it says something, else the default. */
export function improvePrompt(
  answer: Pick<ProjectSettingsAnswer, "settings"> | null | undefined,
): ImprovePrompt {
  const own = answer?.settings?.prompts?.[IMPROVE_PROMPT_KEY]?.trim() ?? "";
  if (own) return { text: own, source: "repository" };
  return { text: GROUPON_IMPROVE.defaultPrompt, source: "default" };
}

/** New workspace's last choices (Paseo's form preferences), read loosely. */
export interface ImproveAgentPreferences {
  provider?: string;
  providerPreferences?: Record<
    string,
    { model?: string; mode?: string; thinkingByModel?: Record<string, string> } | undefined
  >;
}

export interface ImproveAgent {
  provider: string;
  label: string;
  model: string;
  modelLabel: string;
  thinkingOptionId: string | null;
  modeId: string | null;
}

/**
 * The agent the run starts with: the one New workspace used last when this Mac has it ready, else
 * a Claude agent, else the first ready; its model the one used last, else its default.
 */
export function improveAgent(
  entries: readonly ProviderSnapshotEntry[] | undefined,
  preferences: ImproveAgentPreferences | null | undefined,
): ImproveAgent | null {
  const agents = agentChoices(entries);
  const last = preferences?.provider;
  const choice =
    agents.find((agent) => agent.id === last) ??
    agents.find((agent) => agent.id.startsWith("claude")) ??
    agents[0];
  if (!choice) return null;
  const entry = entries?.find((row) => row.provider === choice.id);
  const remembered = preferences?.providerPreferences?.[choice.id];
  const model = defaultModelId(entry, remembered?.model ?? null);
  const definition = selectableModels(entry).find((row) => row.id === model);
  if (!model || !definition) return null;
  return {
    provider: choice.id,
    label: choice.label,
    model,
    modelLabel: definition.label,
    thinkingOptionId: defaultEffortId(definition, remembered?.thinkingByModel?.[model] ?? null),
    modeId: remembered?.mode ?? null,
  };
}

/** Why Start cannot run yet, in the person's words; null when it can. */
export function improveStartProblem(input: {
  entry: RepositoryEntry | null;
  macProblem: string | null;
  serverId: string | null;
  agent: ImproveAgent | null;
  promptReady: boolean;
}): string | null {
  if (!input.entry) return GROUPON_IMPROVE.chooseRepository;
  if (input.macProblem) return input.macProblem;
  if (!input.serverId) return GROUPON_IMPROVE.chooseRepository;
  if (!input.promptReady) return GROUPON_IMPROVE.readingPrompt;
  if (!input.agent) return GROUPON_IMPROVE.noAgent;
  return null;
}

export interface ImproveWorkspaceInput {
  checkout: Pick<RepositoryCheckout, "path" | "projectId">;
  agent: ImproveAgent;
  prompt: string;
}

/**
 * The workspace Start creates: a fresh worktree `improve-repository` cut from the repository's
 * default branch (Paseo picks a free name when one is taken) and its agent with the prompt.
 */
export function improveWorkspaceRequest(
  input: ImproveWorkspaceInput,
): Pick<CreateWorkspaceRequestOptions, "title" | "source" | "agent"> {
  const { checkout, agent } = input;
  return {
    title: GROUPON_IMPROVE.workspaceTitle,
    source: {
      kind: "worktree",
      cwd: checkout.path,
      ...(checkout.projectId ? { projectId: checkout.projectId } : {}),
      worktreeSlug: IMPROVE_WORKTREE_SLUG,
    },
    agent: {
      config: {
        provider: agent.provider,
        cwd: checkout.path,
        model: agent.model,
        ...(agent.thinkingOptionId ? { thinkingOptionId: agent.thinkingOptionId } : {}),
        ...(agent.modeId ? { modeId: agent.modeId } : {}),
      },
      initialPrompt: input.prompt,
    },
  };
}
