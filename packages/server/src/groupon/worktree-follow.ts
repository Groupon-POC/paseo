// Added for Groupon Desk (fork of Paseo, Apache-2.0): a chat follows its agent into another worktree of its repository that the agent's turn worked in.

/**
 * A skill such as review-address may pick or make a worktree of the chat's repository and do its
 * work there while the chat stays on the checkout it started in. The window's diff, branch and
 * pull request follow the chat's workspace, so they kept showing the checkout. When a turn ends
 * and every file it edited in the chat's repository lies in one other worktree that is still
 * there, the chat moves into that worktree (`chat-relocation.ts`), as the door's desk_move does on
 * the agent's word.
 *
 * Responsibilities:
 * - `followedWorktreeOf`: the worktree a turn's edits moved to, or null
 * - `claimTurnEvent`, `noteTurnStart`, `takeTurnStart`: one handling of a turn's end across the
 *   daemon's sessions, each of which hears the same event
 *
 * Constraints:
 * - Only edits count (Edit, Write): a worktree the turn only read (a review), or one it removed
 *   again before the turn ended, never moves the chat
 * - Edits in another repository, or outside any, are left out: such work is a new chat's, never a move
 * - A turn that edited the chat's own worktree as well as another one leaves the chat where it is
 */

import { dirname } from "node:path";
import type { SessionEdit } from "./session-changes.js";

export interface WorktreeFollowDeps {
  /** The worktree a folder belongs to (its top level); null outside a repository or for a folder that is gone. */
  worktreeRootOf(dir: string): Promise<string | null>;
  /** The main checkout's root of the repository a folder belongs to; null outside a repository. */
  mainRepoRoot(dir: string): Promise<string | null>;
}

/** The other worktree of the chat's repository that holds every edit the turn made there; null when there is none. */
export async function followedWorktreeOf(
  input: { edits: readonly SessionEdit[]; chatCwd: string },
  deps: WorktreeFollowDeps,
): Promise<string | null> {
  if (input.edits.length === 0) return null;
  const [chatRoot, chatRepo] = await Promise.all([
    deps.worktreeRootOf(input.chatCwd),
    deps.mainRepoRoot(input.chatCwd),
  ]);
  if (!chatRoot || !chatRepo) return null;
  const roots = new Set<string>();
  for (const dir of new Set(input.edits.map((edit) => dirname(edit.path)))) {
    const root = await deps.worktreeRootOf(dir);
    if (root && (await deps.mainRepoRoot(root)) === chatRepo) roots.add(root);
  }
  const [root] = roots;
  return roots.size === 1 && root !== undefined && root !== chatRoot ? root : null;
}

/** Turn ends already taken by one of the daemon's sessions: every session hears the same event object. */
const CLAIMED_EVENTS = new WeakSet<object>();

/** True for the first session to take this event; false for every other. */
export function claimTurnEvent(event: object): boolean {
  if (CLAIMED_EVENTS.has(event)) return false;
  CLAIMED_EVENTS.add(event);
  return true;
}

/** When each agent's running turn started, for the edits of that turn alone. */
const TURN_STARTS = new Map<string, number>();

export function noteTurnStart(agentId: string, at: number): void {
  TURN_STARTS.set(agentId, at);
}

/** The start of the turn that just ended, forgotten once taken; null when this daemon did not see it start. */
export function takeTurnStart(agentId: string): number | null {
  const at = TURN_STARTS.get(agentId) ?? null;
  TURN_STARTS.delete(agentId);
  return at;
}
