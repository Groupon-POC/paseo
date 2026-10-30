// Changed for Groupon Desk (fork of Paseo, Apache-2.0): the pill counts what the workspace's sessions changed when its Changes compare the session (the default), and stays in every git workspace; the comparison an agent asked for applies, with its base.
import { useRetainedPanelActive } from "@/components/retained-panel";
import { useRequestedCompare } from "@/groupon/requested-compare";
import { useWorkspaceShownDiffStat } from "@/groupon/use-session-diff-stat";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import { useWorkspaceFields } from "@/stores/session-store-hooks";

type DiffStat = NonNullable<WorkspaceDescriptor["diffStat"]>;

/** The pill's count; null when its comparison has no changes, undefined while that is being read. */
export function useVisibleWorkspaceDiffStat(
  serverId: string,
  workspaceId: string,
): DiffStat | null | undefined {
  const diffStat = useWorkspaceFields(serverId, workspaceId, (workspace) => workspace.diffStat);
  const active = useRetainedPanelActive();
  const requested = useRequestedCompare(serverId, workspaceId);
  return useWorkspaceShownDiffStat({
    serverId,
    workspaceId,
    checkoutStat: hasDiffStatChanges(diffStat) ? diffStat : null,
    active,
    baseRef: requested?.baseRef ?? null,
  });
}

/** Groupon Desk: the pill stays in every git workspace, saying None when its comparison has no changes. */
export function useWorkspaceShowsDiffStat(serverId: string, workspaceId: string): boolean {
  return (
    useWorkspaceFields(serverId, workspaceId, (workspace) => workspace.projectKind === "git") ??
    false
  );
}

function hasDiffStatChanges(
  diffStat: WorkspaceDescriptor["diffStat"] | undefined,
): diffStat is DiffStat {
  return Boolean(diffStat && (diffStat.additions > 0 || diffStat.deletions > 0));
}
