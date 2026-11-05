// Added for Groupon Desk (fork of Paseo, Apache-2.0): Cmd+Shift+T brings back the chat whose tab closed last, with its workspace when that went too.

import { useCallback, useRef } from "react";
import { useToast } from "@/contexts/toast-context";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { prepareWorkspaceTab } from "@/utils/workspace-navigation";
import { rememberClosedChat, reopenClosedChat, takeLastClosedChat } from "./close-chat-model";
import { GROUPON_CLOSE_CHAT } from "./strings";

export function useReopenClosedChat(): () => void {
  const toast = useToast();
  const running = useRef(false);

  return useCallback(() => {
    if (running.current) return;
    const chat = takeLastClosedChat();
    if (!chat) {
      toast.show(GROUPON_CLOSE_CHAT.nothingClosed);
      return;
    }
    const client = getHostRuntimeStore().getClient(chat.serverId);
    if (!client) {
      rememberClosedChat(chat);
      toast.error(GROUPON_CLOSE_CHAT.hostDisconnected);
      return;
    }
    running.current = true;
    void (async () => {
      try {
        await reopenClosedChat(chat, {
          restoreWorkspace: (workspaceId) => client.restoreWorkspace(workspaceId),
          unarchiveChat: (agentId) => client.refreshAgent(agentId),
          openChat: ({ serverId, workspaceId, agentId }) => {
            prepareWorkspaceTab({ serverId, workspaceId, target: { kind: "agent", agentId } });
            navigateToWorkspace({ serverId, workspaceId });
          },
        });
      } catch (error) {
        rememberClosedChat(chat);
        toast.error(error instanceof Error ? error.message : GROUPON_CLOSE_CHAT.reopenFailed);
      } finally {
        running.current = false;
      }
    })();
  }, [toast]);
}
