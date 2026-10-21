// Added for Groupon Desk (fork of Paseo, Apache-2.0): what New workspace says while a workspace is being created, instead of a bare spinner.

/**
 * The caption under New workspace's composer from Enter until the workspace opens: the step the
 * daemon reports (`CreationSnapshot.step`, `packages/server/src/groupon/creation-steps.ts`) and how
 * long it has run. Measured on the owner's MacBook Air (2026-10-21, ledger WW-86): the composer was
 * muted for 45.6 s with no word on what was happening; `git worktree add` was most of it.
 *
 * Constraints:
 * - Times are this window's clock (when it saw the step), never the daemon's: the Mac may be another
 *   machine with another clock.
 * - A step this window does not know reads as a generic one; nothing is invented.
 */

export interface CreationProgress {
  /** When the person pressed Enter (window clock, ms). */
  submittedAt: number;
  /** The daemon's current step id, null before it reported one. */
  stepId: string | null;
  /** When this window first saw that step (ms), null before any. */
  stepSeenAt: number | null;
}

const STEP_LABELS: Record<string, string> = {
  naming_branch: "Naming the branch",
  fetching_base: "Fetching the base branch",
  creating_worktree: "Creating the worktree (git worktree add)",
  registering_workspace: "Opening the workspace",
};

/** The progress once Enter is pressed: no step yet. */
export function startedProgress(now: number): CreationProgress {
  return { submittedAt: now, stepId: null, stepSeenAt: null };
}

/** The progress after a snapshot: a new step restarts the step's clock, the same step keeps it. */
export function progressWithStep(
  progress: CreationProgress,
  stepId: string | null | undefined,
  now: number,
): CreationProgress {
  if (!stepId || stepId === progress.stepId) return progress;
  return { ...progress, stepId, stepSeenAt: now };
}

/** "45 s", "1 min 05 s": whole seconds, never negative. */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${String(seconds % 60).padStart(2, "0")} s`;
}

/**
 * "Creating the worktree (git worktree add), 12 s (18 s in all)": the step and its time, and the
 * whole wait when it is longer than the step's. Before the first step: "Starting the workspace, 2 s".
 */
export function creationCaption(progress: CreationProgress, now: number): string {
  const total = now - progress.submittedAt;
  if (!progress.stepId || progress.stepSeenAt === null) {
    return `Starting the workspace, ${formatElapsed(total)}`;
  }
  const label = STEP_LABELS[progress.stepId] ?? "Preparing the workspace";
  const step = now - progress.stepSeenAt;
  const stepText = formatElapsed(step);
  const totalText = formatElapsed(total);
  return stepText === totalText
    ? `${label}, ${stepText}`
    : `${label}, ${stepText} (${totalText} in all)`;
}
