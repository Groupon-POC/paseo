// Changed for Groupon Desk (fork of Paseo, Apache-2.0): the pill counts what the workspace's sessions changed when its Changes compare the session (the default).
import { useRetainedPanelActive } from "@/components/retained-panel";
import {
  useWorkspaceSessionDiffStat,
  useWorkspaceShownDiffStat,
} from "@/groupon/use-session-diff-stat";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import { useWorkspaceFields } from "@/stores/session-store-hooks";

type DiffStat = NonNullable<WorkspaceDescriptor["diffStat"]>;

export function useVisibleWorkspaceDiffStat(
  serverId: string,
  workspaceId: string,
): DiffStat | null {
  const diffStat = useWorkspaceFields(serverId, workspaceId, (workspace) => workspace.diffStat);
  const active = useRetainedPanelActive();
  return useWorkspaceShownDiffStat({
    serverId,
    workspaceId,
    checkoutStat: hasDiffStatChanges(diffStat) ? diffStat : null,
    active,
  });
}

export function useWorkspaceHasDiffStat(serverId: string, workspaceId: string): boolean {
  const checkoutHas =
    useWorkspaceFields(serverId, workspaceId, (workspace) =>
      hasDiffStatChanges(workspace.diffStat),
    ) ?? false;
  const active = useRetainedPanelActive();
  const sessionStat = useWorkspaceSessionDiffStat({ serverId, workspaceId, active });
  return sessionStat === undefined ? checkoutHas : sessionStat !== null;
}

function hasDiffStatChanges(
  diffStat: WorkspaceDescriptor["diffStat"] | undefined,
): diffStat is DiffStat {
  return Boolean(diffStat && (diffStat.additions > 0 || diffStat.deletions > 0));
}
