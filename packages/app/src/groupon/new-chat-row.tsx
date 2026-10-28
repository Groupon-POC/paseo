// Added for Groupon Desk (fork of Paseo, Apache-2.0): "New chat" at the top of the sidebar, a chat that names no project; its keyboard shortcut shows on hover.

import { MessageSquarePlus } from "lucide-react-native";
import { memo, useCallback } from "react";
import { SidebarHeaderRow } from "@/components/sidebar/sidebar-header-row";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import { GROUPON_CHATS } from "./strings";
import { useStartNewChat } from "./use-start-new-chat";

/** Opens New workspace on the "No project" project of the Mac in use, or the first one. */
export const SidebarNewChatRow = memo(function SidebarNewChatRow({
  onBeforeNavigate,
}: {
  onBeforeNavigate?: () => void;
}) {
  const { startNewChat } = useStartNewChat();
  const shortcutKeys = useShortcutKeys("new-chat");
  const handlePress = useCallback(() => {
    void startNewChat(onBeforeNavigate);
  }, [onBeforeNavigate, startNewChat]);

  return (
    <SidebarHeaderRow
      icon={MessageSquarePlus}
      label={GROUPON_CHATS.newChat}
      onPress={handlePress}
      shortcutKeys={shortcutKeys}
      testID="sidebar-global-new-chat"
      variant="compact"
    />
  );
});
