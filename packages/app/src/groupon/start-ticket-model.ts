// Added for Groupon Desk (fork of Paseo, Apache-2.0): Start a ticket's choices, as plain data.

/**
 * Start a ticket (the Dark Factory in the window): a Jira key or link, the repository (a git
 * project with a checkout on the chosen Mac), the agent, its model and effort. The Groupon plugin
 * on that Mac does the rest (`groupon ticket start --name-only`, then Paseo's worktree and the
 * agent with the CLI's flow order). Pure, so the choices are tested without a screen.
 */

import type {
  AgentModelDefinition,
  AgentSelectOption,
  ProviderSnapshotEntry,
} from "@getpaseo/protocol/agent-types";

export interface Choice {
  id: string;
  label: string;
}

/** The CLI's `JIRA_KEY` (`packages/groupon-cli/src/ticket/resolve.ts`). */
const JIRA_KEY = /^[A-Z][A-Z0-9]{1,9}-\d{1,6}$/;

/** `ENC-2123`, `enc-2123`, a pasted Jira link: the key upper-cased, or null (the CLI's `normalizeTicketKey`). */
export function normalizeTicketKey(input: string): string | null {
  let lastSegment = "";
  for (const segment of input.trim().split("/")) if (segment) lastSegment = segment;
  const key = lastSegment.split("?")[0]?.toUpperCase() ?? "";
  return JIRA_KEY.test(key) ? key : null;
}

/** The agents this Mac can start now: providers ready and enabled, by their own label. */
export function agentChoices(entries: readonly ProviderSnapshotEntry[] | undefined): Choice[] {
  return (entries ?? [])
    .filter((entry) => entry.enabled !== false && entry.status === "ready")
    .map((entry) => ({ id: entry.provider, label: entry.label ?? entry.provider }));
}

export function selectableModels(entry: ProviderSnapshotEntry | undefined): AgentModelDefinition[] {
  return (entry?.models ?? []).filter((model) => model.isSelectable !== false);
}

/** The model to start with: the one chosen on the page when the agent has it, else its default, else its first. */
export function defaultModelId(
  entry: ProviderSnapshotEntry | undefined,
  preferred: string | null,
): string | null {
  const models = selectableModels(entry);
  if (preferred && models.some((model) => model.id === preferred)) return preferred;
  return (models.find((model) => model.isDefault) ?? models[0])?.id ?? null;
}

export function effortOptions(model: AgentModelDefinition | undefined): AgentSelectOption[] {
  return model?.thinkingOptions ?? [];
}

/** The effort to start with: the page's when the model offers it, else the model's default; null when it has none. */
export function defaultEffortId(
  model: AgentModelDefinition | undefined,
  preferred: string | null,
): string | null {
  const options = effortOptions(model);
  if (options.length === 0) return null;
  if (preferred && options.some((option) => option.id === preferred)) return preferred;
  return (
    model?.defaultThinkingOptionId ??
    options.find((option) => option.isDefault)?.id ??
    options[0]?.id ??
    null
  );
}

export interface TicketRepository {
  key: string;
  label: string;
  projectRoot: string;
  projectId: string | null;
}

/** The git projects with a checkout on this Mac: where a ticket's worktree can be cut. */
export function repositoryChoices(
  projects: readonly {
    viewKey: string;
    projectName: string;
    projectKind: string;
    hosts: readonly { serverId: string; iconWorkingDir: string; projectId: string }[];
  }[],
  serverId: string,
): TicketRepository[] {
  return projects.flatMap((project) => {
    if (project.projectKind !== "git") return [];
    const placement = project.hosts.find((host) => host.serverId === serverId);
    if (!placement?.iconWorkingDir) return [];
    return [
      {
        key: project.viewKey,
        label: project.projectName,
        projectRoot: placement.iconWorkingDir,
        projectId: placement.projectId || null,
      },
    ];
  });
}

export interface StartTicketForm {
  ticket: string;
  repository: TicketRepository | null;
  provider: string | null;
  model: string | null;
}

/** Why Start cannot run yet, in the person's words; null when it can. */
export function startProblem(form: StartTicketForm): string | null {
  if (!form.ticket.trim()) return "Type the ticket's key or paste its Jira link.";
  if (!normalizeTicketKey(form.ticket)) {
    return "That is not a ticket key or a Jira link (ENC-1234, or https://groupondev.atlassian.net/browse/ENC-1234).";
  }
  if (!form.repository) return "Pick the repository the ticket's branch lives in.";
  if (!form.provider) return "Pick the agent.";
  if (!form.model) return "Pick the model.";
  return null;
}
