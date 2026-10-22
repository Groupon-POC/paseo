// Added for Groupon Desk (fork of Paseo, Apache-2.0): an agent made without an initial prompt (through the hub or the door) is told that the worktree's setup still runs with the first prompt that reaches it.

/**
 * Ledger WW-93 puts "the worktree's setup is still running" before an agent's initial prompt
 * (`create.ts`, `promptPreamble`). An agent made through the hub or the door is created by the hand
 * with no initial prompt, and the hand sends the prompt afterwards as a separate
 * `send_agent_message` (ledger WW-103). This is the same notice for that first prompt.
 *
 * Responsibilities:
 * - `FirstPromptNotice.preambleFor`: the notice for an agent's first user prompt while the setup
 *   runs (the same rules as the initial-prompt case: `setupNoticeFor`), once per agent
 * - `FirstPromptNotice.markPrompted`: an agent created with an initial prompt never gets it again
 *
 * Constraints:
 * - Only the first user prompt: an agent with an earlier user message, or one already served, gets nothing
 * - In memory only: a daemon restart forgets who was served, and `lastUserMessageAt` is the backstop
 * - Never fails the send: a broken read means no notice
 */

import { setupNoticeFor } from "./worktree-setup-state.js";

export interface FirstPromptAgent {
  cwd: string;
  workspaceId: string | undefined;
  /** The agent's last user message; null when it never had one. */
  lastUserMessageAt: Date | null;
}

export interface FirstPromptNoticeDeps {
  notice(
    cwd: string,
    daemonSetupRunning: boolean,
    now: number,
  ): Promise<{ line: string; root: string } | null>;
  daemonSetupRunning(workspaceId: string): boolean;
  now(): number;
}

const defaultDeps = (
  daemonSetupRunning: (workspaceId: string) => boolean,
): FirstPromptNoticeDeps => ({
  notice: (cwd, running, now) => setupNoticeFor(cwd, running, now),
  daemonSetupRunning,
  now: Date.now,
});

export class FirstPromptNotice {
  private readonly prompted = new Set<string>();
  private readonly deps: FirstPromptNoticeDeps;

  constructor(deps: FirstPromptNoticeDeps | ((workspaceId: string) => boolean)) {
    this.deps = typeof deps === "function" ? defaultDeps(deps) : deps;
  }

  /** The agent was created with `initialPrompt`: it got its first prompt some other way, and is never served here. */
  markPrompted(agentId: string, initialPrompt: string | undefined): void {
    if (initialPrompt) this.prompted.add(agentId);
  }

  /** The prompt that carried the notice never went out: the agent's next first prompt gets it. */
  release(agentId: string): void {
    this.prompted.delete(agentId);
  }

  /** The notice and the worktree to follow for `agentId`'s prompt now arriving; null when it gets none. Marks the agent served. */
  async preambleFor(
    agentId: string,
    agent: FirstPromptAgent | null,
  ): Promise<{ line: string; root: string } | null> {
    if (!agent || agent.lastUserMessageAt || this.prompted.has(agentId)) return null;
    // Claimed before the read: a second prompt arriving while the file is read never gets it again.
    this.prompted.add(agentId);
    return this.deps
      .notice(
        agent.cwd,
        agent.workspaceId !== undefined && this.deps.daemonSetupRunning(agent.workspaceId),
        this.deps.now(),
      )
      .catch(() => null);
  }
}

const notices = new WeakMap<object, FirstPromptNotice>();

/** The one notice ledger of a daemon, keyed by its agent manager. */
export function firstPromptNoticeFor(
  owner: object,
  daemonSetupRunning: (workspaceId: string) => boolean,
): FirstPromptNotice {
  let notice = notices.get(owner);
  if (!notice) {
    notice = new FirstPromptNotice(daemonSetupRunning);
    notices.set(owner, notice);
  }
  return notice;
}
