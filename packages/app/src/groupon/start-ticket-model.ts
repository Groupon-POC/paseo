// Added for Groupon Desk (fork of Paseo, Apache-2.0): Start a ticket's choices, as plain data.

/**
 * Start a ticket (the Dark Factory in the window): a Jira key or link, the repository (a git
 * project with a checkout on the chosen Mac), the agent, its model and effort. The Groupon plugin
 * on that Mac does the rest (`groupon ticket start --name-only`, then Paseo's worktree and the
 * agent with the CLI's flow order). Pure, so the choices are tested without a screen.
 *
 * The run itself (`TicketRun`): each step the hand reports (naming the branch, grading the
 * assignment, starting the agent), its end, and the window's own end when the hand says nothing
 * for `TICKET_GIVE_UP_MS` (WW-83: a spinner with one sentence for minutes read as a hang, and was
 * closed before the hand-back came). An answer for an earlier attempt never changes a later one.
 */

import type {
  AgentModelDefinition,
  AgentSelectOption,
  ProviderSnapshotEntry,
} from "@getpaseo/protocol/agent-types";
import type { JobAnswer, TicketOutcome, TicketStep } from "./desk-plugin-rpc";
import { GROUPON_TICKET } from "./strings";

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

/** The steps in the order they run, in the person's words. */
export const TICKET_STEPS: readonly { step: TicketStep; label: string }[] = [
  { step: "naming", label: GROUPON_TICKET.stepNaming },
  { step: "grading", label: GROUPON_TICKET.stepGrading },
  { step: "starting", label: GROUPON_TICKET.stepStarting },
];

const labelOf = (step: TicketStep): string =>
  TICKET_STEPS.find((row) => row.step === step)?.label ?? step;

/**
 * When the window stops waiting: the CLI stops its grader at 4 minutes and the plugin stops the
 * CLI at 4.5 (`packages/desk-paseo-plugin/server/ticket-start.ts`), so a hand that is alive has
 * answered by then; 5 minutes of nothing is a hand that is gone.
 */
export const TICKET_GIVE_UP_MS = 5 * 60 * 1000;

export type HandedBack = Extract<TicketOutcome, { kind: "handed-back" }>;

export type TicketRun =
  | { status: "idle" }
  | { status: "running"; attempt: number; startedAt: number; step: TicketStep; phase: string }
  | { status: "failed"; attempt: number; step: TicketStep | null; error: string }
  | { status: "gave-up"; attempt: number; step: TicketStep; error: string }
  | { status: "handed-back"; attempt: number; outcome: HandedBack }
  | { status: "started"; attempt: number; workspaceId: string };

/** A new attempt, on its first step. */
export function runStarted(ticket: string, attempt: number, now: number): TicketRun {
  return {
    status: "running",
    attempt,
    startedAt: now,
    step: "naming",
    phase: `${GROUPON_TICKET.stepNaming} of ${ticket}`,
  };
}

const isStep = (value: unknown): value is TicketStep =>
  value === "naming" || value === "grading" || value === "starting";

/**
 * The step a job is on: the plugin's word, else read off its sentence (a plugin older than the
 * steps says "Cutting the worktree ..." once the CLI is done), else where the run was.
 */
export function stepOfJob(
  job: Pick<JobAnswer, "phase" | "step">,
  previous: TicketStep,
): TicketStep {
  if (isStep(job.step)) return job.step;
  return job.phase.startsWith("Cutting the worktree") ? "starting" : previous;
}

/** The run after the hand's answer for `attempt`; an answer for another attempt changes nothing. */
export function runAfterJob(run: TicketRun, attempt: number, job: JobAnswer): TicketRun {
  if (run.status !== "running" || run.attempt !== attempt) return run;
  const step = stepOfJob(job, run.step);
  if (job.status === "running") return { ...run, step, phase: job.phase };
  if (job.status === "failed" || !job.ticket) {
    return { status: "failed", attempt, step, error: job.error ?? GROUPON_TICKET.didNotFinish };
  }
  if (job.ticket.kind === "handed-back")
    return { status: "handed-back", attempt, outcome: job.ticket };
  return { status: "started", attempt, workspaceId: job.ticket.workspaceId };
}

/** The run after a call to the hand failed for `attempt` (the daemon gone, the plugin missing). */
export function runAfterError(run: TicketRun, attempt: number, error: string): TicketRun {
  if (run.status !== "running" || run.attempt !== attempt) return run;
  return { status: "failed", attempt, step: run.step, error };
}

/** "The hand did not finish: <step>, see the hand's log", with where that log is. */
export function gaveUpText(step: TicketStep, hostLabel: string): string {
  return `The hand did not finish: ${labelOf(step)}, see the hand's log (${GROUPON_TICKET.handLog} on ${hostLabel}).`;
}

/** The run once `now` is reached: one still running after `TICKET_GIVE_UP_MS` is given up on. */
export function runAfterClock(run: TicketRun, now: number, hostLabel: string): TicketRun {
  if (run.status !== "running" || now - run.startedAt < TICKET_GIVE_UP_MS) return run;
  return {
    status: "gave-up",
    attempt: run.attempt,
    step: run.step,
    error: gaveUpText(run.step, hostLabel),
  };
}

export type StepState = "done" | "current" | "pending" | "stopped";

/** Each step with where it stands: those before the run's step done, its step current (or stopped), the rest pending. */
export function stepRows(run: TicketRun): { step: TicketStep; label: string; state: StepState }[] {
  if (run.status !== "running" && run.status !== "failed" && run.status !== "gave-up") return [];
  const at = run.step === null ? -1 : TICKET_STEPS.findIndex((row) => row.step === run.step);
  return TICKET_STEPS.map((row, index) => {
    let state: StepState = "pending";
    if (index < at) state = "done";
    else if (index === at) state = run.status === "running" ? "current" : "stopped";
    return { step: row.step, label: row.label, state };
  });
}

/** How long the run has gone, `0:45`, `3:07`. */
export function elapsedText(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
