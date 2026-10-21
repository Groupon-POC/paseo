// Added for Groupon Desk (fork of Paseo, Apache-2.0): the worktree's setup (pnpm install, checkout:prepare) as one visible line above the agent's composer.

/**
 * A new worktree's setup runs beside the agent (the agent starts as soon as `git worktree add` is
 * done; MEASURED on the owner's MacBook Air 2026-10-21: install 99 s and checkout:prepare about
 * 76 s, both after the agent's first reply). This says, above the composer, which step runs and
 * for how long, and "Worktree ready" when it is done, so the person knows when builds and tests
 * may run.
 *
 * The steps come from the markers `groupon desk repo setup` prints in the setup's log
 * (`packages/groupon-cli/src/hand/repo-scripts.ts` in groupon2/engineering-development):
 *   [desk setup 1/2] pnpm install --frozen-lockfile (started 2026-10-21T15:39:13.120Z)
 *   [desk setup] ready in 171 s
 *   [desk setup] failed at 2/2 with exit 1 after 95 s
 * A repository whose setup prints none still gets a line, named by its setup command.
 *
 * Constraints:
 * - Reads only what the daemon sent (the setup snapshot); never starts or reruns anything.
 * - "Worktree ready" stays for `READY_VISIBLE_MS` after the setup ended, then the line goes.
 */

import { formatElapsed } from "./creation-progress-model";

export const READY_VISIBLE_MS = 20_000;

export interface SetupStepMarker {
  index: number;
  total: number;
  command: string;
  startedAt: number | null;
}

export interface SetupMarkers {
  /** The last step that started, null when the log has no marker. */
  step: SetupStepMarker | null;
  /** The first step's start, the whole setup's clock. */
  startedAt: number | null;
  finished: { ok: boolean; seconds: number } | null;
}

const STEP_RE = /^\[desk setup (\d+)\/(\d+)\] (.+?)(?: \(started ([^)]+)\))?$/;
const READY_RE = /^\[desk setup\] ready in (\d+) s$/;
const FAILED_RE = /^\[desk setup\] failed at \d+\/\d+ with exit \S+ after (\d+) s$/;
/** A terminal's colour codes, which a setup's log may carry. */
const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`, "g");

function timeOf(text: string | undefined): number | null {
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? null : ms;
}

/** The markers in a setup log, latest wins. */
export function parseSetupMarkers(log: string): SetupMarkers {
  const markers: SetupMarkers = { step: null, startedAt: null, finished: null };
  for (const raw of log.split(/\r?\n|\r/)) {
    const line = raw.replace(ANSI_RE, "").trim();
    const step = STEP_RE.exec(line);
    if (step) {
      const startedAt = timeOf(step[4]);
      markers.step = {
        index: Number(step[1]),
        total: Number(step[2]),
        command: step[3]!,
        startedAt,
      };
      if (markers.startedAt === null) markers.startedAt = startedAt;
      markers.finished = null;
      continue;
    }
    const ready = READY_RE.exec(line);
    if (ready) {
      markers.finished = { ok: true, seconds: Number(ready[1]) };
      continue;
    }
    const failed = FAILED_RE.exec(line);
    if (failed) markers.finished = { ok: false, seconds: Number(failed[1]) };
  }
  return markers;
}

/** What the line needs of the daemon's setup snapshot (`workspace_setup_progress`). */
export interface SetupSnapshotLike {
  status: "running" | "completed" | "failed" | "blocked";
  updatedAt: number;
  detail: {
    commands: readonly {
      command: string;
      log?: string;
      status: "running" | "completed" | "failed";
      exitCode: number | null;
      durationMs?: number;
    }[];
  };
}

export interface WorktreeSetupLine {
  tone: "running" | "ready" | "failed";
  text: string;
}

function runningText(
  command: { command: string; log?: string },
  markers: SetupMarkers,
  now: number,
): string {
  if (!markers.step) return `Preparing the worktree: ${command.command}`;
  const { index, total, command: stepCommand } = markers.step;
  const counter = total > 1 ? ` (${index}/${total})` : "";
  const since = markers.startedAt ?? markers.step.startedAt;
  const elapsed = since === null ? "" : `, ${formatElapsed(now - since)}`;
  return `Preparing the worktree${counter}: ${stepCommand}${elapsed}`;
}

/** The line for a workspace's setup now, or null when there is nothing to say. */
export function worktreeSetupLine(
  snapshot: SetupSnapshotLike | null,
  now: number,
): WorktreeSetupLine | null {
  if (!snapshot || snapshot.status === "blocked") return null;
  const commands = snapshot.detail.commands;
  if (commands.length === 0) return null;
  const log = commands.map((command) => command.log ?? "").join("\n");
  const markers = parseSetupMarkers(log);
  if (snapshot.status === "running") {
    const current = commands.find((command) => command.status === "running") ?? commands.at(-1)!;
    return {
      tone: "running",
      text: `${runningText(current, markers, now)}. The agent can already work.`,
    };
  }
  if (snapshot.status === "failed") {
    const failed = commands.find((command) => command.status === "failed") ?? commands.at(-1)!;
    const step = markers.step ? markers.step.command : failed.command;
    const code = failed.exitCode === null ? "" : ` (exit ${failed.exitCode})`;
    return { tone: "failed", text: `Worktree setup failed at ${step}${code}. Setup has the log.` };
  }
  if (now - snapshot.updatedAt > READY_VISIBLE_MS) return null;
  const seconds =
    markers.finished?.ok === true
      ? markers.finished.seconds
      : Math.round(commands.reduce((sum, command) => sum + (command.durationMs ?? 0), 0) / 1000);
  return {
    tone: "ready",
    text: seconds > 0 ? `Worktree ready in ${formatElapsed(seconds * 1000)}` : "Worktree ready",
  };
}
