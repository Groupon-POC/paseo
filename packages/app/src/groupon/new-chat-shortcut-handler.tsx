// Added for Groupon Desk (fork of Paseo, Apache-2.0): the "New chat" keyboard shortcut (`chat.new`), bound in Settings > Keyboard shortcuts.

import { useCallback } from "react";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import type { KeyboardActionId } from "@/keyboard/keyboard-action-dispatcher";
import { useStartNewChat } from "./use-start-new-chat";

const CHAT_NEW_ACTIONS: readonly KeyboardActionId[] = ["chat.new"];

/** Headless: hosted in the root layout beside the pin shortcut, so the app shell never re-renders for it. */
export function NewChatShortcutHandler() {
  const { canStart, startNewChat } = useStartNewChat();
  const handle = useCallback(() => {
    if (!canStart) return false;
    void startNewChat();
    return true;
  }, [canStart, startNewChat]);

  useKeyboardActionHandler({
    handlerId: "chat-new-global",
    actions: CHAT_NEW_ACTIONS,
    enabled: canStart,
    priority: 0,
    handle,
  });
  return null;
}
