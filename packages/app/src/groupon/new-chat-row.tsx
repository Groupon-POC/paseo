// Added for Groupon Desk (fork of Paseo, Apache-2.0): "New chat" at the top of the sidebar, a chat that names no project.

import { router } from "expo-router";
import { MessageSquarePlus } from "lucide-react-native";
import { memo, useCallback, useState } from "react";
import { SidebarHeaderRow } from "@/components/sidebar/sidebar-header-row";
import { useToast } from "@/contexts/toast-context";
import { useHostRuntimeClient, useHosts } from "@/runtime/host-runtime";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { buildNewWorkspaceRoute } from "@/utils/host-routes";
import { ensureChatsProject } from "./project-less-chats";
import { GROUPON_CHATS } from "./strings";

/** Opens New workspace on the "No project" project of the Mac in use, or the first one. */
export const SidebarNewChatRow = memo(function SidebarNewChatRow({
  onBeforeNavigate,
}: {
  onBeforeNavigate?: () => void;
}) {
  const toast = useToast();
  const hosts = useHosts();
  const activeServerId = useActiveWorkspaceSelection()?.serverId ?? null;
  const serverId = activeServerId ?? hosts[0]?.serverId ?? "";
  const client = useHostRuntimeClient(serverId);
  const [busy, setBusy] = useState(false);

  const handlePress = useCallback(async () => {
    if (busy) return;
    if (!client) {
      toast.error(GROUPON_CHATS.noHost);
      return;
    }
    setBusy(true);
    try {
      const project = await ensureChatsProject(client);
      onBeforeNavigate?.();
      router.push(
        buildNewWorkspaceRoute({
          serverId,
          sourceDirectory: project.rootPath,
          projectId: project.projectId,
        }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : GROUPON_CHATS.startFailed);
    } finally {
      setBusy(false);
    }
  }, [busy, client, onBeforeNavigate, serverId, toast]);

  return (
    <SidebarHeaderRow
      icon={MessageSquarePlus}
      label={GROUPON_CHATS.newChat}
      onPress={handlePress}
      testID="sidebar-global-new-chat"
      variant="compact"
    />
  );
});
