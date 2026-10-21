// Added for Groupon Desk (fork of Paseo, Apache-2.0): the agent learns that the worktree's setup still runs beside it, and its install or test waits for the setup instead of racing it.

/**
 * A new worktree's agent starts right after `git worktree add` while `pnpm install` and
 * `pnpm checkout:prepare` run beside it (design 8.2 in groupon2/engineering-development, ledger
 * WW-86; MEASURED on the owner's MacBook Air 2026-10-21: the agent answered at 7 s, the install
 * ran 99 s and checkout:prepare about 76 s). An agent that installs or tests in its first minutes
 * collides with the setup (pnpm's store, half-built dists). Ledger WW-93: the hand's
 * `groupon desk repo setup` writes the setup's state to `.groupon/setup-state.json`
 * (`packages/groupon-cli/src/hand/setup-state.ts` there, the one writer); this reads it.
 *
 * Responsibilities:
 * - `readSetupState`: the state of the worktree holding a folder, null when there is none or it is
 *   unreadable
 * - `setupStillRunning`: whether an agent starting now must be told (the file, else the daemon's own
 *   setup snapshot for a repository whose setup is `groupon desk repo setup`)
 * - `setupRunningNotice`, `setupReadyLine`: the words the agent gets
 * - `withPromptPreamble`: the notice before the first prompt as a text attachment, which the agent
 *   reads first and the person's own message in the transcript leaves out
 * - `commandNeedsSetup`, `waitForSetup`, `setupWaitHook`: a Bash call that installs, builds or
 *   tests waits for the setup (at most `SETUP_WAIT_MS`), then runs; a failed setup lets it run at
 *   once with a line in the hand's log
 *
 * Constraints:
 * - Never writes the file and never fails the agent: a missing or broken file means "not running"
 * - A `running` older than `SETUP_STALE_MS` is a setup a restart cut short, never waited on
 * - The wait never blocks a call that does not need the setup, and gives up when the turn is stopped
 */

import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import type { AgentPromptInput } from "../server/agent/agent-sdk-types.js";

export const SETUP_STATE_FILE = ".groupon/setup-state.json";
export const DESK_FILE = ".groupon/desk.toml";
/** The longest a Bash call waits for the setup. */
export const SETUP_WAIT_MS = 5 * 60_000;
/** How often a waiting call reads the file again. */
export const SETUP_POLL_MS = 2_000;
/** A setup still `running` after this long was cut short (a restart, a killed hand). */
export const SETUP_STALE_MS = 30 * 60_000;

const SetupStateSchema = z.object({
  state: z.enum(["running", "ready", "failed"]),
  step: z.string().nullable().optional(),
  steps: z.array(z.string()).optional(),
  startedAt: z.string(),
  finishedAt: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
});
export type SetupState = z.infer<typeof SetupStateSchema>;

export function parseSetupState(text: string): SetupState | null {
  try {
    const parsed = SetupStateSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type ReadText = (path: string) => Promise<string | null>;
export type IsThere = (path: string) => Promise<boolean>;

export const readTextOrNull: ReadText = async (path) => {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
};

const pathExists: IsThere = async (path) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

/** The nearest folder at or above `start` holding `.git` (a folder in a checkout, a file in a worktree). */
export async function worktreeRootOf(
  start: string,
  exists: IsThere = pathExists,
): Promise<string | null> {
  let folder = resolve(start);
  for (;;) {
    if (await exists(join(folder, ".git"))) return folder;
    const parent = dirname(folder);
    if (parent === folder) return null;
    folder = parent;
  }
}

/** The setup state of the worktree at `root`. */
export async function readSetupState(
  root: string,
  read: ReadText = readTextOrNull,
): Promise<SetupState | null> {
  const text = await read(join(root, SETUP_STATE_FILE));
  return text === null ? null : parseSetupState(text);
}

/** Whether the worktree's repository file hands its setup to the hand, which writes the state file. */
export async function deskRunsSetup(
  root: string,
  read: ReadText = readTextOrNull,
): Promise<boolean> {
  const text = await read(join(root, DESK_FILE));
  return text !== null && /\bgroupon desk repo setup\b/.test(text);
}

/** A `running` state that is not stale. */
export function isRunning(state: SetupState | null, now: number): boolean {
  if (state?.state !== "running") return false;
  const started = Date.parse(state.startedAt);
  return Number.isNaN(started) || now - started < SETUP_STALE_MS;
}

/**
 * Whether the agent starting now must be told the setup still runs: the file says so; or there is
 * no file yet (the hand starts a moment after the daemon) while the daemon's own setup of this
 * workspace runs and the repository's setup is the hand's, which writes the file.
 */
export function setupStillRunning(input: {
  file: SetupState | null;
  daemonSetupRunning: boolean;
  deskRunsSetup: boolean;
  now: number;
}): boolean {
  if (input.file) return isRunning(input.file, input.now);
  return input.daemonSetupRunning && input.deskRunsSetup;
}

/** The steps as the notice names them: `pnpm install, then pnpm checkout:prepare`. */
function stepsOf(state: SetupState | null): string {
  const steps = state?.steps?.filter((step) => step.trim().length > 0) ?? [];
  return steps.length > 0 ? steps.join(", then ") : "pnpm install, then pnpm checkout:prepare";
}

/** The line put before the agent's first prompt while the setup runs. */
export function setupRunningNotice(state: SetupState | null): string {
  return `The worktree's setup is still running (${stepsOf(state)}). Read ${SETUP_STATE_FILE} and wait for state ready before installing, building or testing.`;
}

/**
 * `line` before `prompt`, as a text attachment: a provider sends it as the first text of the
 * message, and the transcript's user message keeps only the person's typed words (attachments carry
 * a `mimeType`, `submittedPromptText` in `agent-manager.ts`).
 */
export function withPromptPreamble(line: string, prompt: AgentPromptInput): AgentPromptInput {
  const rest = typeof prompt === "string" ? [{ type: "text" as const, text: prompt }] : prompt;
  return [{ type: "text", mimeType: "text/plain", title: "Groupon Desk", text: line }, ...rest];
}

/** Whole seconds the setup took, from the file, else from when the daemon started watching. */
export function setupSeconds(state: SetupState | null, watchedSince: number, now: number): number {
  const started = state ? Date.parse(state.startedAt) : Number.NaN;
  const finished = state?.finishedAt ? Date.parse(state.finishedAt) : Number.NaN;
  const from = Number.isNaN(started) ? watchedSince : started;
  const to = Number.isNaN(finished) ? now : finished;
  return Math.max(0, Math.round((to - from) / 1000));
}

/** The line the agent gets when the setup has ended. */
export function setupReadyLine(state: SetupState | null, seconds: number): string {
  if (state?.state === "failed") {
    return `The worktree's setup failed after ${seconds} s (${state.error ?? "no reason recorded"}); see ${SETUP_STATE_FILE}. Run the failed step yourself before building or testing.`;
  }
  return `Worktree ready in ${seconds} s: installing, building and testing are safe now.`;
}

/** A shell command that installs, builds or tests with pnpm, which must not race the setup. */
const NEEDS_SETUP =
  /(?:^|[\s;&|(])pnpm(?:\s+(?:-{1,2}[\w-]+(?:=\S+)?|(?:-C|--dir|--filter|-F)\s+\S+))*\s+(?:run\s+)?(?:install|i|add|test|build|validate|checkout:prepare|type-check)(?=$|[\s;&|)])/;

export function commandNeedsSetup(command: string): boolean {
  return NEEDS_SETUP.test(command);
}

export type SetupWaitOutcome = "not-running" | "ready" | "failed" | "timed-out" | "stopped";

export interface SetupWaitDeps {
  read(): Promise<SetupState | null>;
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

/** Waits while the setup runs, at most `timeoutMs`; answers how it ended. */
export async function waitForSetup(
  deps: SetupWaitDeps,
  options: { timeoutMs?: number; pollMs?: number; signal?: AbortSignal } = {},
): Promise<SetupWaitOutcome> {
  const timeoutMs = options.timeoutMs ?? SETUP_WAIT_MS;
  const pollMs = options.pollMs ?? SETUP_POLL_MS;
  const started = deps.now();
  let state = await deps.read();
  if (!isRunning(state, started)) return state?.state === "failed" ? "failed" : "not-running";
  for (;;) {
    if (options.signal?.aborted) return "stopped";
    const left = timeoutMs - (deps.now() - started);
    if (left <= 0) return "timed-out";
    await deps.sleep(Math.min(pollMs, left), options.signal);
    if (options.signal?.aborted) return "stopped";
    state = await deps.read();
    if (state?.state === "ready") return "ready";
    if (state?.state === "failed") return "failed";
    if (!isRunning(state, deps.now())) return "not-running";
  }
}

/** Sleeps `ms`, or until `signal` aborts. */
export async function sleepFor(ms: number, signal?: AbortSignal): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  await new Promise<void>((done) => {
    timer = setTimeout(done, ms);
    onAbort = done;
    signal?.addEventListener("abort", onAbort, { once: true });
  });
  clearTimeout(timer);
  if (onAbort) signal?.removeEventListener("abort", onAbort);
}

export interface SetupWaitHookDeps {
  /** The setup state of the worktree holding `cwd`. */
  readFor(cwd: string): Promise<SetupState | null>;
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  /** One line in the hand's log. */
  log(line: string): void;
}

/** What a PreToolUse hook answers: nothing changed, or a note for the agent on why it waited. */
export type SetupWaitHookResult =
  | Record<string, never>
  | { hookSpecificOutput: { hookEventName: "PreToolUse"; additionalContext: string } };

/**
 * Claude Code's PreToolUse callback for Bash: a command that needs the setup waits for it while it
 * runs, then runs; nothing else is touched. Never denies a call.
 */
export function setupWaitHook(
  deps: SetupWaitHookDeps,
  options: { timeoutMs?: number; pollMs?: number } = {},
) {
  return async (
    input: unknown,
    _toolUseId: string | undefined,
    context: { signal: AbortSignal },
  ): Promise<SetupWaitHookResult> => {
    const call = hookCall(input);
    if (!call || !commandNeedsSetup(call.command)) return {};
    const started = deps.now();
    try {
      const outcome = await waitForSetup(
        { read: () => deps.readFor(call.cwd), now: deps.now, sleep: deps.sleep },
        { ...options, signal: context.signal },
      );
      const waited = Math.round((deps.now() - started) / 1000);
      if (outcome === "failed") {
        deps.log(
          `setup wait: the worktree's setup failed, "${firstWords(call.command)}" runs at once (${call.cwd})`,
        );
        return {};
      }
      if (outcome === "timed-out") {
        deps.log(
          `setup wait: still running after ${waited} s, "${firstWords(call.command)}" runs anyway (${call.cwd})`,
        );
        return note(
          `The worktree's setup was still running after ${waited} s; this command ran anyway. Check ${SETUP_STATE_FILE}.`,
        );
      }
      if (outcome === "ready") {
        deps.log(
          `setup wait: "${firstWords(call.command)}" waited ${waited} s for the setup (${call.cwd})`,
        );
        return note(
          `This command waited ${waited} s for the worktree's setup to finish; the worktree is ready.`,
        );
      }
      return {};
    } catch (err) {
      deps.log(
        `setup wait: not read (${err instanceof Error ? err.message : String(err)}); the command runs`,
      );
      return {};
    }
  };
}

function note(additionalContext: string): SetupWaitHookResult {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext } };
}

function firstWords(command: string): string {
  const line = command.trim().split("\n")[0] ?? "";
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

function hookCall(input: unknown): { command: string; cwd: string } | null {
  if (!input || typeof input !== "object") return null;
  const record = input as { tool_name?: unknown; tool_input?: unknown; cwd?: unknown };
  if (record.tool_name !== "Bash" || typeof record.cwd !== "string") return null;
  const toolInput = record.tool_input as { command?: unknown } | undefined;
  return typeof toolInput?.command === "string"
    ? { command: toolInput.command, cwd: record.cwd }
    : null;
}

/** The PreToolUse matcher's timeout in seconds: the wait and a margin, so Claude Code never cuts the wait short. */
export const SETUP_WAIT_HOOK_TIMEOUT_S = SETUP_WAIT_MS / 1000 + 30;

/** One line in the hand's log: the daemon's stderr, which the hand keeps in `serve.log`, stamped as the hand stamps its own. */
export function handLog(line: string): void {
  process.stderr.write(
    `${new Date().toISOString().slice(11, 19)} groupon worktree setup: ${line}\n`,
  );
}

/** The setup state of the worktree holding `cwd`, read from disk. */
export async function readSetupStateFor(cwd: string): Promise<SetupState | null> {
  const root = await worktreeRootOf(cwd);
  return root === null ? null : readSetupState(root);
}

/** The Bash wait with the real file, clock and log, for the Claude Code provider. */
export function realSetupWaitHook() {
  return setupWaitHook({
    readFor: readSetupStateFor,
    now: Date.now,
    sleep: sleepFor,
    log: handLog,
  });
}

/**
 * What a new agent in `cwd` is told before its first prompt, with the worktree to watch; null when
 * the setup is not running (or the folder is in no worktree).
 */
export async function setupNoticeFor(
  cwd: string,
  daemonSetupRunning: boolean,
  now: number,
  read: ReadText = readTextOrNull,
  exists: IsThere = pathExists,
): Promise<{ line: string; root: string } | null> {
  const root = await worktreeRootOf(cwd, exists);
  if (root === null) return null;
  const file = await readSetupState(root, read);
  const routed = file === null && daemonSetupRunning ? await deskRunsSetup(root, read) : false;
  if (!setupStillRunning({ file, daemonSetupRunning, deskRunsSetup: routed, now })) return null;
  return { line: setupRunningNotice(file), root };
}
