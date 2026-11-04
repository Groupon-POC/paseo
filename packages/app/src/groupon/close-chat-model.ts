// Added for Groupon Desk (fork of Paseo, Apache-2.0): what closing a chat's tab says and what it takes along, and the closed chats Cmd+Shift+T brings back.

import { GROUPON_CLOSE_CHAT } from "./strings";

export interface CloseChatFacts {
  running: boolean;
  lastInWorkspace: boolean;
  /** The archive also removes the worktree: Desk made it, and this is its last chat. */
  removesWorktree: boolean;
  /** What is lost with that worktree, as the archive warning words it. */
  risks: string[];
}

export interface CloseChatDialogContent {
  title: string;
  message: string;
  warnings: string[];
  confirmLabel: string;
}

function whatMoves(facts: CloseChatFacts): string {
  if (!facts.lastInWorkspace) return GROUPON_CLOSE_CHAT.chatOnly;
  return facts.removesWorktree
    ? GROUPON_CLOSE_CHAT.chatAndSessionAndWorktree
    : GROUPON_CLOSE_CHAT.chatAndSession;
}

export function closeChatDialogOf(facts: CloseChatFacts): CloseChatDialogContent {
  const warnings = facts.removesWorktree ? facts.risks : [];
  const sentences = [
    facts.running ? GROUPON_CLOSE_CHAT.running : null,
    whatMoves(facts),
    warnings.length > 0 ? GROUPON_CLOSE_CHAT.bringBackNotChanges : GROUPON_CLOSE_CHAT.bringBack,
  ];
  return {
    title: facts.running ? GROUPON_CLOSE_CHAT.runningTitle : GROUPON_CLOSE_CHAT.title,
    message: sentences.filter(Boolean).join(" "),
    warnings,
    confirmLabel: facts.running ? GROUPON_CLOSE_CHAT.runningConfirm : GROUPON_CLOSE_CHAT.confirm,
  };
}

interface ChatRow {
  id: string;
  workspaceId?: string | null;
  parentAgentId?: string | null;
  archivedAt?: Date | null;
}

/** Nothing else keeps the workspace: no other chat of its own, and no terminal a process may run in. */
export function isLastChatOfWorkspace(input: {
  agents: Iterable<ChatRow>;
  agentId: string;
  workspaceId: string;
  hasTerminalTab: boolean;
}): boolean {
  if (input.hasTerminalTab) return false;
  for (const agent of input.agents) {
    if (
      agent.id !== input.agentId &&
      agent.workspaceId === input.workspaceId &&
      !agent.parentAgentId &&
      !agent.archivedAt
    ) {
      return false;
    }
  }
  return true;
}

export interface ClosedChat {
  serverId: string;
  workspaceId: string;
  agentId: string;
  workspaceArchived: boolean;
}

const MAX_CLOSED_CHATS = 20;
let closedChats: ClosedChat[] = [];

export function rememberClosedChat(chat: ClosedChat): void {
  closedChats = [
    ...closedChats.filter((row) => row.agentId !== chat.agentId).slice(1 - MAX_CLOSED_CHATS),
    chat,
  ];
}

export function takeLastClosedChat(): ClosedChat | null {
  const chat = closedChats.at(-1) ?? null;
  closedChats = closedChats.slice(0, -1);
  return chat;
}

export interface ReopenChatDeps {
  restoreWorkspace: (workspaceId: string) => Promise<unknown>;
  unarchiveChat: (agentId: string) => Promise<unknown>;
  openChat: (chat: ClosedChat) => void;
}

/** The workspace first: the chat resumes in its folder, which a removed worktree only has again after that. */
export async function reopenClosedChat(chat: ClosedChat, deps: ReopenChatDeps): Promise<void> {
  if (chat.workspaceArchived) await deps.restoreWorkspace(chat.workspaceId);
  await deps.unarchiveChat(chat.agentId);
  deps.openChat(chat);
}
