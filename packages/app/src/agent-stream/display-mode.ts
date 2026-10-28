// Added for Groupon Desk (fork of Paseo, Apache-2.0): which stream rows the chat shows, by the person's display mode.

import type { ChatDisplayMode } from "@/hooks/use-settings";
import type { StreamItem } from "@/types/stream";

/**
 * Display only: the history keeps every row. "fluent" shows a tool call while it runs and keeps
 * the ones that failed, and thinking only while it is going on; "output" shows no tool call and
 * no thinking at all.
 */
export function isShownInDisplayMode(
  item: StreamItem,
  mode: ChatDisplayMode,
  isTurnActive: boolean,
): boolean {
  if (mode === "all") return true;
  if (item.kind === "thought") {
    return mode === "fluent" && isTurnActive && item.status === "loading";
  }
  if (item.kind !== "tool_call") return true;
  if (mode === "output") return false;
  const status = item.payload.data.status;
  if (status === "failed") return true;
  return isTurnActive && (status === "running" || status === "executing");
}

export function filterForDisplayMode(
  items: StreamItem[],
  mode: ChatDisplayMode,
  isTurnActive: boolean,
): StreamItem[] {
  if (mode === "all") return items;
  return items.filter((item) => isShownInDisplayMode(item, mode, isTurnActive));
}
