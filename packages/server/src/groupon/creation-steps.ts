// Added for Groupon Desk (fork of Paseo, Apache-2.0): a workspace being created says which step it is on, so the window shows it instead of a bare spinner.

/**
 * The steps of creating a workspace, reported from deep inside the work (the branch's name, the
 * fetch of the base, `git worktree add`, the workspace's record) to the creation that is running them,
 * without threading a callback through Paseo's worktree functions: the creation runs its work
 * inside `runWithCreationSteps`, and the code that starts a step calls `reportCreationStep`.
 * Outside a creation (an agent's own worktree, a test) a report goes nowhere.
 *
 * Measured on the owner's MacBook Air (2026-10-21, ledger WW-86): New workspace muted the composer
 * for 45.6 s, of which `git worktree add` of the 22,787 files of engineering-development took about
 * 40 s under load; the window said nothing about it.
 *
 * `stepTimings` times them: how long each step ran, so a slow creation says which step took the time
 * (ledger WW-105: the Mac mini's creation took 27 s, 24 s of it before the worktree directory
 * existed, and the daemon log named no step).
 *
 * Constraints:
 * - A step is a fact for the screen, never persisted and never a milestone: the creation's phases
 *   (`accepted`, `workspace_ready`, ...) stay the only state a retry reads.
 * - A reporter that throws never fails the creation.
 */

import { AsyncLocalStorage } from "node:async_hooks";

/** The steps a window names; a newer daemon may send one an older window does not know. */
export const CREATION_STEP_IDS = [
  "naming_branch",
  "fetching_base",
  "creating_worktree",
  "registering_workspace",
] as const;
export type CreationStepId = (typeof CREATION_STEP_IDS)[number];

export type CreationStepReporter = (id: CreationStepId) => void;

const reporters = new AsyncLocalStorage<CreationStepReporter>();

/** Runs `work` with `report` receiving every step `work` (and what it awaits) reports. */
export function runWithCreationSteps<T>(report: CreationStepReporter, work: () => T): T {
  return reporters.run(report, work);
}

/** Tells the running creation, if any, that `id` starts now. */
export function reportCreationStep(id: CreationStepId): void {
  const report = reporters.getStore();
  if (!report) return;
  try {
    report(id);
  } catch {
    // The step is for the screen only; the work goes on.
  }
}

/** How long one step of a creation ran; `start` is the time before the first step reported. */
export interface CreationStepTiming {
  step: CreationStepId | "start";
  ms: number;
}

/**
 * Times the steps of one creation: `begin` when the work starts, `enter` for each step it reports,
 * `end` when it returns or throws. Every step's duration goes to `emit` once the next one starts.
 */
export function createStepTimings(
  emit: (timing: CreationStepTiming, totalMs: number) => void,
  now: () => number = Date.now,
) {
  const began = now();
  let current: CreationStepTiming["step"] = "start";
  let since = began;
  const close = (): void => {
    const at = now();
    emit({ step: current, ms: at - since }, at - began);
    since = at;
  };
  return {
    enter(id: CreationStepId): void {
      close();
      current = id;
    },
    end(): void {
      close();
    },
  };
}
