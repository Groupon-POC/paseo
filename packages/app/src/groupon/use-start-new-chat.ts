// Added for Groupon Desk (fork of Paseo, Apache-2.0): starting a chat that names no project, shared by the sidebar's "New chat" row and its keyboard shortcut.

import { router } from "expo-router";
import { useCallback, useRef } from "react";
import { useToast } from "@/contexts/toast-context";
import { useHostRuntimeClient, useHosts } from "@/runtime/host-runtime";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { buildNewWorkspaceRoute } from "@/utils/host-routes";
import { ensureChatsProject } from "./project-less-chats";
import { GROUPON_CHATS } from "./strings";

/**
 * Opens New workspace on the "No project" project of the Mac in use, or the first one; a second
 * start while one is on its way does nothing. Answers whether a Mac was there to start it on.
 */
export function useStartNewChat(): {
  canStart: boolean;
  startNewChat: (onBeforeNavigate?: () => void) => Promise<void>;
} {
  const toast = useToast();
  const hosts = useHosts();
  const activeServerId = useActiveWorkspaceSelection()?.serverId ?? null;
  const serverId = activeServerId ?? hosts[0]?.serverId ?? "";
  const client = useHostRuntimeClient(serverId);
  const busy = useRef(false);

  const startNewChat = useCallback(
    async (onBeforeNavigate?: () => void) => {
      if (busy.current) return;
      if (!client) {
        toast.error(GROUPON_CHATS.noHost);
        return;
      }
      busy.current = true;
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
        busy.current = false;
      }
    },
    [client, serverId, toast],
  );

  return { canStart: hosts.length > 0, startNewChat };
}
