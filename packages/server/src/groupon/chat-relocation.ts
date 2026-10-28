// Added for Groupon Desk (fork of Paseo, Apache-2.0): a chat moves into another worktree of its own repository once its turn ends, asked once however many ask.

/**
 * A chat that started in a checkout goes on in a worktree its agent made there (a new ticket's
 * branch, `git worktree add`, a skill's own worktree). The window's diff, terminal, pull request
 * and archive follow a chat's workspace, so the chat moves into that worktree's workspace with the
 * same agent, the same session and its whole conversation: the agent's session is reloaded in the
 * worktree, which Claude Code resumes by id from any folder.
 *
 * Responsibilities:
 * - `scheduleChatRelocation`: checks the request, finds or makes the worktree's workspace, and
 *   moves the chat once the turn that asked for it ends; answers the workspace at once
 * - `relocationCandidatesOf`: the workspaces of the chat's own project on the folder; the session
 *   takes one no chat is in, or makes the chat a workspace of its own there
 *
 * Constraints:
 * - Only a worktree of the chat's own repository: work in another repository is a new chat (the
 *   door's `desk_start` with the conversation), never a move
 * - The path comes over a local boundary and is checked as untrusted: absolute, an existing
 *   folder, the same main repository root as the chat's
 * - The move waits for the turn to end: the agent asks from inside its own turn, and reloading it
 *   then would cut the turn that is still answering
 */

import { isAbsolute } from "node:path";
import { areEquivalentPaths } from "../utils/path.js";

/** The Groupon Desk plugin RPC the agents' door calls: `{ agentId, path }`, answered `{ workspaceId, cwd }`. */
export const CHAT_RELOCATE_RPC = "groupon-desk.chats.relocate";

export interface RelocatedChat {
  cwd: string;
  /** Whether the chat has a provider session to continue; a chat that never ran has none. */
  hasSession: boolean;
}

export interface ChatRelocationDeps {
  getChat(agentId: string): Promise<RelocatedChat | null>;
  /** The folder's real path, links resolved; null when there is none. */
  realpath(path: string): Promise<string | null>;
  /** The main checkout's root of the repository a folder belongs to; null outside a repository. */
  mainRepoRoot(cwd: string): Promise<string | null>;
  workspaceFor(cwd: string): Promise<{ workspaceId: string }>;
  /** Resolves once the agent's turn has ended (idle or failed), not while a question waits. */
  waitForTurnEnd(agentId: string): Promise<void>;
  relocate(agentId: string, cwd: string, workspaceId: string): Promise<void>;
  onFailure(agentId: string, error: unknown): void;
}

/** Moves asked for and not yet done, by agent: the agent's desk_move and the follow of its edits may ask for the same turn. */
const SCHEDULED = new Map<string, { workspaceId: string; cwd: string }>();

/**
 * Checks the move, makes the workspace, and moves the chat when its turn ends; answers the
 * workspace now. A chat already waiting to move answers that move's workspace and is not moved twice.
 */
export async function scheduleChatRelocation(
  input: { agentId: string; path: string },
  deps: ChatRelocationDeps,
): Promise<{ workspaceId: string; cwd: string }> {
  const scheduled = SCHEDULED.get(input.agentId);
  if (scheduled) return scheduled;
  if (!isAbsolute(input.path)) throw new Error("The worktree's path must be absolute");
  const chat = await deps.getChat(input.agentId);
  if (!chat) throw new Error(`Agent not found: ${input.agentId}`);
  if (!chat.hasSession) throw new Error("The chat has no session to continue yet");
  const cwd = await deps.realpath(input.path);
  if (!cwd) throw new Error(`No folder at ${input.path}`);
  if (cwd === (await deps.realpath(chat.cwd))) throw new Error(`The chat already runs in ${cwd}`);
  const [from, to] = await Promise.all([deps.mainRepoRoot(chat.cwd), deps.mainRepoRoot(cwd)]);
  if (!to) throw new Error(`${cwd} is not in a git repository`);
  if (from !== to) {
    throw new Error(
      `${cwd} is not a worktree of the chat's repository (${from ?? chat.cwd}): start a new chat there instead`,
    );
  }
  const { workspaceId } = await deps.workspaceFor(cwd);
  const answer = { workspaceId, cwd };
  SCHEDULED.set(input.agentId, answer);
  void deps
    .waitForTurnEnd(input.agentId)
    .then(() => deps.relocate(input.agentId, cwd, workspaceId))
    .catch((error: unknown) => deps.onFailure(input.agentId, error))
    .finally(() => SCHEDULED.delete(input.agentId));
  return answer;
}

/**
 * The workspaces a moved chat may take in its folder: the chat's own project's, active, on that
 * folder. Looking a folder up by its path alone made a worktree outside Paseo's own worktrees
 * folder (a skill's `.claude/worktrees/<name>`) a project of its own, and put the chat into
 * another chat's workspace on a checkout, where every chat has a workspace of its own.
 */
export function relocationCandidatesOf<
  T extends { projectId: string; cwd: string; archivedAt: string | null; background?: boolean },
>(workspaces: readonly T[], projectId: string, cwd: string): T[] {
  return workspaces.filter(
    (workspace) =>
      workspace.projectId === projectId &&
      !workspace.archivedAt &&
      !workspace.background &&
      areEquivalentPaths(workspace.cwd, cwd),
  );
}
