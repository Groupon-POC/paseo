// Added for Groupon Desk (fork of Paseo, Apache-2.0): a workspace records the tabs it shows and goes back and forward through them on the keyboard.

import { useCallback, useEffect } from "react";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import type {
  KeyboardActionDefinition,
  KeyboardActionId,
} from "@/keyboard/keyboard-action-dispatcher";
import { collectAllTabs, findPaneById } from "@/stores/workspace-layout-actions";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { revealWorkspaceTab } from "@/workspace-tabs/navigation";
import { useTabHistoryStore } from "./tab-history";

const HISTORY_ACTIONS: readonly KeyboardActionId[] = [
  "workspace.history.back",
  "workspace.history.forward",
];

/** The tab the workspace shows: the focused pane's focused tab. */
function shownTab(workspaceKey: string): string | null {
  const layout = useWorkspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
  if (!layout) return null;
  return findPaneById(layout.root, layout.focusedPaneId)?.focusedTabId ?? null;
}

/**
 * Records each tab the workspace shows (`tab-history.ts`) while it is on screen, and handles Back
 * and Forward for it when `enabled` (the workspace's route is focused).
 */
export function useWorkspaceTabHistory(input: {
  workspaceKey: string | null;
  enabled: boolean;
  handlerId: string;
}): void {
  const { workspaceKey } = input;
  useEffect(() => {
    if (!workspaceKey) return;
    const record = () => {
      const tabId = shownTab(workspaceKey);
      if (tabId) useTabHistoryStore.getState().record(workspaceKey, tabId);
    };
    record();
    return useWorkspaceLayoutStore.subscribe(record);
  }, [workspaceKey]);

  const handle = useCallback(
    (action: KeyboardActionDefinition) => {
      if (!workspaceKey) return false;
      const layout = useWorkspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
      if (!layout) return false;
      const open = new Set(collectAllTabs(layout.root).map((tab) => tab.tabId));
      const delta = action.id === "workspace.history.back" ? -1 : 1;
      const tabId = useTabHistoryStore.getState().step(workspaceKey, delta, (id) => open.has(id));
      if (!tabId) return false;
      revealWorkspaceTab(workspaceKey, tabId);
      return true;
    },
    [workspaceKey],
  );
  useKeyboardActionHandler({
    handlerId: input.handlerId,
    actions: HISTORY_ACTIONS,
    enabled: input.enabled && workspaceKey !== null,
    priority: 100,
    isActive: () => true,
    handle,
  });
}
