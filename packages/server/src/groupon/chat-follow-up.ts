// Added for Groupon Desk (fork of Paseo, Apache-2.0): a message that starts a chat's next turn once the turn now running ends, for the agents' door: a session that changed its own model or effort goes on by itself, on the new ones.

/** The Groupon Desk plugin RPC the door calls: `{ agentId, text }`, answered as a `ScheduledFollowUp`. */
export const CHAT_FOLLOW_UP_RPC = "groupon-desk.chats.followUp";
const MAX_TEXT = 20_000;

/** Chats with a follow-up waiting for their turn to end. */
const WAITING = new Set<string>();

export interface ScheduledFollowUp {
  /** True when this message starts the next turn; false when one asked earlier still waits. */
  continueWith: boolean;
}

export interface ChatFollowUpDeps {
  waitForTurnEnd: (agentId: string) => Promise<void>;
  send: (agentId: string, text: string) => Promise<void>;
  onFailure: (agentId: string, error: unknown) => void;
}

/** A request from the door; it crosses a local boundary, so both fields are checked. */
export function chatFollowUpRequestOf(input: unknown): { agentId: string; text: string } {
  const fields =
    typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const { agentId, text } = fields;
  if (typeof agentId !== "string" || agentId.trim() === "") throw new Error("agentId is required");
  if (typeof text !== "string" || text.trim() === "") throw new Error("text is required");
  if (text.length > MAX_TEXT) throw new Error(`text is longer than ${MAX_TEXT} characters`);
  return { agentId, text };
}

/** Sends `text` once the chat's turn ends, at once when none runs; one follow-up waits per chat. */
export function scheduleChatFollowUp(
  request: { agentId: string; text: string },
  deps: ChatFollowUpDeps,
): ScheduledFollowUp {
  if (WAITING.has(request.agentId)) return { continueWith: false };
  WAITING.add(request.agentId);
  void deps
    .waitForTurnEnd(request.agentId)
    .then(() => deps.send(request.agentId, request.text))
    .catch((error: unknown) => deps.onFailure(request.agentId, error))
    .finally(() => WAITING.delete(request.agentId));
  return { continueWith: true };
}
