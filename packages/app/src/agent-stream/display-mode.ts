// Added for Groupon Desk (fork of Paseo, Apache-2.0): which stream rows the chat shows, by the person's display mode, and Live's slot of what runs now.

import type { ChatDisplayMode } from "@/hooks/use-settings";
import type { StreamItem } from "@/types/stream";

/**
 * Display only: the history keeps every row. "fluent" (Live) shows the messages, the tool calls
 * that failed and the questions the person answered; what runs now (a tool call, thinking) is not a row there, it is the turn footer's
 * slot above the running turn's footer (`liveItemOf`), so nothing enters the list and leaves it again and the chat
 * never jumps. "output" shows no tool call and no thinking at all.
 */
export function isShownInDisplayMode(item: StreamItem, mode: ChatDisplayMode): boolean {
  if (mode === "all") return true;
  if (item.kind === "thought") return false;
  if (item.kind !== "tool_call") return true;
  if (mode !== "fluent") return false;
  const data = item.payload.data;
  if (data.status === "failed") return true;
  // A question the person answered stays: it is part of the conversation, and it stays put.
  return (
    item.payload.source === "agent" &&
    data.status === "completed" &&
    item.payload.data.name === "AskUserQuestion"
  );
}

export function filterForDisplayMode(items: StreamItem[], mode: ChatDisplayMode): StreamItem[] {
  if (mode === "all") return items;
  return items.filter((item) => isShownInDisplayMode(item, mode));
}

/**
 * What the agent is doing right now, for Live's slot above the running turn's footer: the latest
 * tool call still running, else a thought still streaming; null when neither is.
 */
export function liveItemOf(items: readonly StreamItem[]): StreamItem | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (!item) continue;
    if (item.kind === "thought" && item.status === "loading") return item;
    if (
      item.kind === "tool_call" &&
      item.payload.source === "agent" &&
      item.payload.data.status === "running"
    ) {
      return item;
    }
  }
  return null;
}
