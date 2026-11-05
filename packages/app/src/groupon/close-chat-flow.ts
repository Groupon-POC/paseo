// Added for Groupon Desk (fork of Paseo, Apache-2.0): what closing a chat's tab asks and does: the chat to the archive, and with its workspace's last chat the workspace too.

import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { buildWorktreeArchiveRiskReasons } from "@/git/worktree-archive-warning";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import { redirectIfArchivingActiveWorkspace } from "@/utils/sidebar-workspace-archive-redirect";
import { purgeArchivedWorkspaceState } from "@/workspace/use-workspace-archive";
import { archiveWorkspaceOptimistically } from "@/workspace/workspace-archive";
import {
  closeChatDialogOf,
  type CloseChatDialogContent,
  isLastChatOfWorkspace,
  rememberClosedChat,
} from "./close-chat-model";
import { readUncommittedStat } from "./uncommitted-stat";

interface CloseChatTarget {
  serverId: string;
  workspaceId: string;
  agentId: string;
}

async function worktreeRisks(input: {
  workspace: WorkspaceDescriptor | null | undefined;
  client: DaemonClient | null;
}): Promise<string[]> {
  const git = input.workspace?.gitRuntime;
  const isDirty = git?.isDirty ?? null;
  return buildWorktreeArchiveRiskReasons({
    isDirty,
    aheadOfOrigin: git?.aheadOfOrigin ?? null,
    diffStat:
      isDirty && input.client && input.workspace
        ? await readUncommittedStat(input.client, input.workspace.id)
        : null,
  });
}

export async function closeChatPlanOf(
  target: CloseChatTarget & {
    agents: Parameters<typeof isLastChatOfWorkspace>[0]["agents"];
    hasTerminalTab: boolean;
    running: boolean;
    workspace: WorkspaceDescriptor | null | undefined;
    client: DaemonClient | null;
  },
): Promise<{ lastInWorkspace: boolean; dialog: CloseChatDialogContent }> {
  const lastInWorkspace = isLastChatOfWorkspace(target);
  const removesWorktree =
    lastInWorkspace &&
    target.workspace?.workspaceKind === "worktree" &&
    Boolean(target.workspace.worktreeSlug);
  return {
    lastInWorkspace,
    dialog: closeChatDialogOf({
      running: target.running,
      lastInWorkspace,
      removesWorktree,
      risks: removesWorktree ? await worktreeRisks(target) : [],
    }),
  };
}

/** The tab is gone by now. Errors stay as they were: the archive mutation reports its own. */
export function archiveClosedChat(
  target: CloseChatTarget & {
    lastInWorkspace: boolean;
    client: DaemonClient | null;
    archiveAgent: (input: { serverId: string; agentId: string }) => Promise<unknown>;
  },
): void {
  const { serverId, workspaceId, agentId, lastInWorkspace, client } = target;
  rememberClosedChat({ serverId, workspaceId, agentId, workspaceArchived: lastInWorkspace });
  const workspace = { serverId, workspaceId };
  if (lastInWorkspace) {
    redirectIfArchivingActiveWorkspace({ ...workspace, activeWorkspaceSelection: workspace });
  }
  void (async () => {
    try {
      await target.archiveAgent({ serverId, agentId });
      if (!lastInWorkspace || !client) return;
      await archiveWorkspaceOptimistically({ client, workspace });
      purgeArchivedWorkspaceState(workspace);
    } catch {
      // Reported where the archive ran.
    }
  })();
}
