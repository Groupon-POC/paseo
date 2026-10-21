// Added for Groupon Desk (fork of Paseo, Apache-2.0): an agent told that the worktree's setup still runs is told when it ends, without a turn of its own.

/**
 * The second half of ledger WW-93: an agent whose first prompt said "the worktree's setup is still
 * running" (`worktree-setup-state.ts`) gets "Worktree ready in N s" (or the failure) when the setup
 * ends. The line is steered into the agent's running turn as a system line; an idle agent is never
 * woken for it: the line waits and is steered in the moment the agent's next turn starts, the way
 * the hand's mailbox delivers notes to a turn the window started (groupon2/engineering-development,
 * `packages/groupon-cli/src/hand/note-courier.ts`).
 *
 * Responsibilities:
 * - `SetupNoticeCourier.watch`: follows one workspace's setup state for one agent until it ends
 * - delivering the end's line once per agent: now into a running turn, else at its next turn start
 *
 * Constraints:
 * - Never starts a turn and never interrupts one: only a steer the provider accepts delivers
 * - A setup that never ends within `SETUP_STALE_MS` is let go with one log line, nothing sent
 * - In memory only: a daemon restart forgets the watch (the agent can still read the file)
 */

import {
  isRunning,
  SETUP_POLL_MS,
  SETUP_STALE_MS,
  type SetupState,
  setupReadyLine,
  setupSeconds,
} from "./worktree-setup-state.js";

export type DaemonSetupStatus = "running" | "completed" | "failed" | "blocked" | null;

export interface SetupNoticeCourierDeps {
  read(root: string): Promise<SetupState | null>;
  /** The daemon's own setup snapshot of the workspace, when this daemon runs it. */
  daemonSetupStatus(workspaceId: string): DaemonSetupStatus;
  /** Steers `line` into the agent's running turn; true only when the provider took it. */
  steer(agentId: string, line: string): Promise<boolean>;
  /** Calls `listener` when an agent's turn starts; answers the unsubscribe. */
  onTurnStarted(listener: (agentId: string) => void): () => void;
  now(): number;
  sleep(ms: number): Promise<void>;
  log(line: string): void;
}

export interface SetupWatch {
  agentId: string;
  workspaceId: string;
  root: string;
}

/** How many turn starts a waiting line tries before it is let go (a provider that cannot steer). */
const TURN_START_TRIES = 3;

export class SetupNoticeCourier {
  private readonly watching = new Set<string>();
  private readonly waiting = new Map<string, { line: string; tries: number }>();
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly deps: SetupNoticeCourierDeps) {}

  /** Follows the setup for `watch.agentId`; a second watch of the same agent is ignored. Resolves when the line is handed over or let go. */
  watch(watch: SetupWatch): Promise<void> {
    if (this.watching.has(watch.agentId)) return Promise.resolve();
    this.watching.add(watch.agentId);
    return this.follow(watch).finally(() => this.watching.delete(watch.agentId));
  }

  private async follow(watch: SetupWatch): Promise<void> {
    const since = this.deps.now();
    for (;;) {
      const state = await this.deps.read(watch.root).catch(() => null);
      const ended = this.endOf(state, watch.workspaceId, since);
      if (ended) {
        const line = setupReadyLine(ended, setupSeconds(ended, since, this.deps.now()));
        await this.deliver(watch.agentId, line);
        return;
      }
      if (this.deps.now() - since >= SETUP_STALE_MS) {
        this.deps.log(
          `setup notice: ${watch.workspaceId} still not ready after ${Math.round(SETUP_STALE_MS / 60_000)} min, agent ${watch.agentId} not told`,
        );
        return;
      }
      await this.deps.sleep(SETUP_POLL_MS);
    }
  }

  /** The ended state (from the file, else from the daemon's own setup), null while it runs. */
  private endOf(state: SetupState | null, workspaceId: string, since: number): SetupState | null {
    if (state) {
      if (state.state !== "running") return state;
      return isRunning(state, this.deps.now())
        ? null
        : { ...state, state: "failed", error: "it stopped reporting" };
    }
    const daemon = this.deps.daemonSetupStatus(workspaceId);
    if (daemon === "running" || daemon === null) return null;
    // No file: the hand wrote none (an older CLI); the daemon's own setup is the clock, from the watch's start.
    const startedAt = new Date(since).toISOString();
    const finishedAt = new Date(this.deps.now()).toISOString();
    return daemon === "completed"
      ? { state: "ready", startedAt, finishedAt }
      : { state: "failed", startedAt, finishedAt, error: `the setup ended ${daemon}` };
  }

  private async deliver(agentId: string, line: string): Promise<void> {
    if (await this.deps.steer(agentId, line).catch(() => false)) {
      this.deps.log(`setup notice: agent ${agentId} told in its running turn: ${line}`);
      return;
    }
    this.waiting.set(agentId, { line, tries: 0 });
    this.listen();
    this.deps.log(`setup notice: agent ${agentId} is idle; told at its next turn`);
  }

  private listen(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.deps.onTurnStarted((agentId) => {
      if (this.waiting.has(agentId)) void this.atTurnStart(agentId);
    });
  }

  private async atTurnStart(agentId: string): Promise<void> {
    const held = this.waiting.get(agentId);
    if (!held) return;
    held.tries += 1;
    const taken = await this.deps.steer(agentId, held.line).catch(() => false);
    if (taken || held.tries >= TURN_START_TRIES) {
      this.waiting.delete(agentId);
      this.deps.log(
        taken
          ? `setup notice: agent ${agentId} told at its turn start: ${held.line}`
          : `setup notice: agent ${agentId} could not be told after ${held.tries} turns; let go`,
      );
    }
    if (this.waiting.size === 0 && this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}

const couriers = new WeakMap<object, SetupNoticeCourier>();

/** The one courier of a daemon, keyed by its agent manager. */
export function setupNoticeCourierFor(
  owner: object,
  make: () => SetupNoticeCourierDeps,
): SetupNoticeCourier {
  let courier = couriers.get(owner);
  if (!courier) {
    courier = new SetupNoticeCourier(make());
    couriers.set(owner, courier);
  }
  return courier;
}
