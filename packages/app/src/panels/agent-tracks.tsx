// Changed for Groupon Desk (fork of Paseo, Apache-2.0): the row of who is in this workspace now (`groupon/presence-row.tsx`), beside the subagents and the diff; the worktree's setup step (`groupon/worktree-setup-line.tsx`); the agent's Monitor watches (`groupon/agent-monitors.tsx`).
import type { AgentAddress } from "@getpaseo/protocol/addresses";
import { memo, useCallback, type ReactElement } from "react";
import { WorkspaceDiffStatPill } from "@/composer/diff-stat-pill";
import { useWorkspaceShowsDiffStat } from "@/composer/workspace-diff-stat";
import { AgentTaskList } from "@/composer/task-list";
import { ComposerTrackBar } from "@/composer/tracks";
import { useIsCompactFormFactor } from "@/constants/layout";
import { usePaneContext } from "@/panels/pane-context";
import { useSettings } from "@/hooks/use-settings";
import { AgentMonitorsPill, useAgentMonitors } from "@/groupon/agent-monitors";
import { PresenceRow, presenceVisible, usePaseoWorkspacePresence } from "@/groupon/presence-row";
import { useWorktreeSetupLine, WorktreeSetupRow } from "@/groupon/worktree-setup-line";
import { PluginComposerPills } from "@/plugins";
import { useSessionStore } from "@/stores/session-store";
import {
  type ArchiveFinishedStatus,
  useArchiveSubagent,
  useDetachSubagent,
  useSubagentOpensInSheet,
  type SubagentRow,
} from "@/subagents";
import { SubagentsTrack } from "@/subagents/track";
import type { TodoEntry } from "@/types/stream";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { buildWorkspaceTabPersistenceKey, type WorkspaceTabTarget } from "@/workspace-tabs/model";
import { openPreferredWorkspaceTarget } from "@/workspace-tabs/open-beside";
import { openComposerChanges } from "@/workspace-tabs/open-supporting-view";

/**
 * The pane's ambient context — workspace changes, subagents, and tasks — as a row of pills above
 * the composer.
 *
 * The row shares the composer's keyboard transform and owns the space between itself and the
 * transcript. Each pill owns its action while tab placement stays behind the workspace boundary.
 */
export const AgentTracks = memo(function AgentTracks({
  serverId,
  workspaceId,
  agentId,
  subagentRows,
  tasks,
  archiveFinishedStatus,
  onArchiveFinished,
  hasPluginComposerPills,
}: {
  serverId: string;
  workspaceId: string;
  agentId: string;
  subagentRows: SubagentRow[];
  tasks: TodoEntry[] | undefined;
  archiveFinishedStatus: ArchiveFinishedStatus;
  onArchiveFinished: () => void;
  hasPluginComposerPills: boolean;
}): ReactElement | null {
  const { tabId } = usePaneContext();
  const hasWorkspaceDiffStat = useWorkspaceShowsDiffStat(serverId, workspaceId);
  const isCompact = useIsCompactFormFactor();
  const openInSidePane = useSettings((settings) => settings.openInSidePane);
  const workspaceKey = buildWorkspaceTabPersistenceKey({ serverId, workspaceId });
  const canDetachSubagents = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.agentDetach === true,
  );
  const archiveSubagent = useArchiveSubagent();
  const detachSubagent = useDetachSubagent();
  const openSubagentTarget = useCallback(
    (target: WorkspaceTabTarget) => {
      openPreferredWorkspaceTarget({
        workspaceKey,
        target,
        source: "subagents",
        preferences: openInSidePane,
        parentTabId: tabId,
      });
    },
    [openInSidePane, tabId, workspaceKey],
  );
  const handleOpenSubagent = useCallback(
    ({ serverId: targetServerId, agentId: subagentId }: AgentAddress) => {
      const session = useSessionStore.getState().sessions[targetServerId];
      const agent = session?.agents.get(subagentId) ?? session?.agentDetails.get(subagentId);
      // A subagent in another workspace lives in that workspace's tabs.
      if (
        targetServerId !== serverId ||
        (agent?.workspaceId && agent.workspaceId !== workspaceId)
      ) {
        navigateToAgent({ serverId: targetServerId, agentId: subagentId });
        return;
      }
      openSubagentTarget({ kind: "agent", agentId: subagentId });
    },
    [openSubagentTarget, serverId, workspaceId],
  );
  const handleOpenProviderSubagent = useCallback(
    (parentAgentId: string, subagentId: string) => {
      openSubagentTarget({ kind: "provider_subagent", parentAgentId, subagentId });
    },
    [openSubagentTarget],
  );
  const opensInSheet = useSubagentOpensInSheet(workspaceKey);
  const presence = usePaseoWorkspacePresence(serverId, workspaceId);
  const setupLine = useWorktreeSetupLine(serverId, workspaceId);
  const monitors = useAgentMonitors(serverId, agentId);
  const handleOpenChanges = useCallback(() => {
    if (!workspaceKey) {
      return;
    }
    openComposerChanges({
      isCompact,
      workspaceKey,
      preferences: openInSidePane,
    });
  }, [isCompact, openInSidePane, workspaceKey]);

  if (
    !hasWorkspaceDiffStat &&
    !hasAgentTracks({
      subagentRows,
      tasks,
      archiveFinishedStatus,
      hasPluginComposerPills,
      hasGrouponPresence: presenceVisible(presence.view),
      hasGrouponWorktreeSetup: setupLine !== null,
      hasGrouponMonitors: monitors.length > 0,
    })
  ) {
    return null;
  }

  return (
    <ComposerTrackBar>
      <AgentTaskList tasks={tasks} />
      <WorktreeSetupRow line={setupLine} />
      <PresenceRow view={presence.view} hubWorkspaceId={presence.hubWorkspaceId} />
      <AgentMonitorsPill serverId={serverId} agentId={agentId} monitors={monitors} />
      <SubagentsTrack
        serverId={serverId}
        rows={subagentRows}
        onOpenSubagent={handleOpenSubagent}
        onOpenProviderSubagent={handleOpenProviderSubagent}
        opensInSheet={opensInSheet}
        onArchiveSubagent={archiveSubagent}
        onArchiveFinished={onArchiveFinished}
        archiveFinishedStatus={archiveFinishedStatus}
        onDetachSubagent={canDetachSubagents ? detachSubagent : undefined}
      />
      <PluginComposerPills
        serverId={serverId}
        workspaceId={workspaceId}
        agentId={agentId}
        compact={isCompact}
      />
      <WorkspaceDiffStatPill
        serverId={serverId}
        workspaceId={workspaceId}
        onPress={handleOpenChanges}
      />
    </ComposerTrackBar>
  );
});

export function hasAgentTracks({
  subagentRows,
  tasks,
  archiveFinishedStatus,
  hasPluginComposerPills = false,
  hasGrouponPresence = false,
  hasGrouponWorktreeSetup = false,
  hasGrouponMonitors = false,
}: {
  subagentRows: readonly SubagentRow[];
  tasks: readonly TodoEntry[] | undefined;
  archiveFinishedStatus: ArchiveFinishedStatus;
  hasPluginComposerPills?: boolean;
  /** Groupon Desk: the presence row has something to show. */
  hasGrouponPresence?: boolean;
  /** Groupon Desk: the worktree's setup line has something to show. */
  hasGrouponWorktreeSetup?: boolean;
  /** Groupon Desk: the agent has Monitor watches running. */
  hasGrouponMonitors?: boolean;
}): boolean {
  return (
    subagentRows.length > 0 ||
    Boolean(tasks?.length) ||
    archiveFinishedStatus.kind !== "idle" ||
    hasPluginComposerPills ||
    hasGrouponPresence ||
    hasGrouponWorktreeSetup ||
    hasGrouponMonitors
  );
}
