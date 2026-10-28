// Added for Groupon Desk (fork of Paseo, Apache-2.0): back and forward through the tabs a workspace showed, like a browser's history.

/**
 * Each workspace keeps the tabs it showed in the order it showed them: opening a file from a chat,
 * a diff, another chat. Back (Cmd+Left on a Mac, Alt+Left elsewhere) returns to the tab before,
 * Forward goes ahead again; moving to a new tab after going back drops what lay ahead, as a
 * browser does. A tab closed since is skipped.
 *
 * Constraints:
 * - Kept in memory only, per workspace
 * - Going back or forward is not itself recorded as a new step
 */

import { create } from "zustand";

/** How many steps a workspace remembers. */
const HISTORY_LIMIT = 50;

export interface TabHistory {
  entries: string[];
  /** Where the workspace is in `entries`. */
  index: number;
}

export const EMPTY_TAB_HISTORY: TabHistory = { entries: [], index: -1 };

/** The history once the workspace shows `tabId`; unchanged when it already stands there. */
export function recordTab(history: TabHistory, tabId: string): TabHistory {
  if (history.entries[history.index] === tabId) return history;
  const entries = [...history.entries.slice(0, history.index + 1), tabId].slice(-HISTORY_LIMIT);
  return { entries, index: entries.length - 1 };
}

/** One step back (-1) or forward (1) to a tab that still exists; null when there is none. */
export function stepTab(
  history: TabHistory,
  delta: -1 | 1,
  exists: (tabId: string) => boolean,
): { history: TabHistory; tabId: string } | null {
  for (
    let index = history.index + delta;
    index >= 0 && index < history.entries.length;
    index += delta
  ) {
    const tabId = history.entries[index];
    if (tabId && exists(tabId)) return { history: { ...history, index }, tabId };
  }
  return null;
}

interface TabHistoryState {
  histories: Record<string, TabHistory>;
  record: (workspaceKey: string, tabId: string) => void;
  step: (workspaceKey: string, delta: -1 | 1, exists: (tabId: string) => boolean) => string | null;
}

export const useTabHistoryStore = create<TabHistoryState>()((set, get) => ({
  histories: {},
  record: (workspaceKey, tabId) =>
    set((state) => {
      const current = state.histories[workspaceKey] ?? EMPTY_TAB_HISTORY;
      const next = recordTab(current, tabId);
      return next === current ? state : { histories: { ...state.histories, [workspaceKey]: next } };
    }),
  step: (workspaceKey, delta, exists) => {
    const current = get().histories[workspaceKey] ?? EMPTY_TAB_HISTORY;
    const moved = stepTab(current, delta, exists);
    if (!moved) return null;
    set((state) => ({ histories: { ...state.histories, [workspaceKey]: moved.history } }));
    return moved.tabId;
  },
}));
