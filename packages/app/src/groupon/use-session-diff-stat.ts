// Added for Groupon Desk (fork of Paseo, Apache-2.0): the +/− count of what a workspace's sessions changed, for the composer's pill and the sidebar's hover card.

import { useCheckoutDiffQuery } from "@/git/use-diff-query";
import { useWorkspaceDirectory } from "@/stores/session-store-hooks";
import { checkoutModeOf, sessionModeOf } from "@/git/working-diff-comparison/state";
import { useMemo } from "react";
import { useWorkingDiffComparison } from "@/git/working-diff-comparison";
import { useSessionChanges } from "./use-session-changes";

export interface DiffCount {
  additions: number;
  deletions: number;
}

/** The lines the files add and remove in all; null when nothing changed. */
export function countDiff(files: readonly DiffCount[]): DiffCount | null {
  const total = files.reduce(
    (sum, file) => ({
      additions: sum.additions + file.additions,
      deletions: sum.deletions + file.deletions,
    }),
    { additions: 0, deletions: 0 },
  );
  return total.additions > 0 || total.deletions > 0 ? total : null;
}

/**
 * What the workspace's sessions changed in all, when its Changes views compare the session (the
 * default); undefined when they compare the checkout, or the Mac's daemon predates the session
 * comparison. The session is read only while `active`.
 */
export function useWorkspaceSessionDiffStat(input: {
  serverId: string;
  workspaceId: string;
  active: boolean;
}): DiffCount | null | undefined {
  const { comparison } = useWorkingDiffComparison({
    serverId: input.serverId,
    workspaceId: input.workspaceId,
    cwd: "",
  });
  const sessionMode = sessionModeOf(comparison);
  const isSession = sessionMode !== null;
  const session = useSessionChanges({
    serverId: input.serverId,
    workspaceId: input.workspaceId,
    enabled: input.active && isSession,
    mode: sessionMode ?? "all",
  });
  const sessionStat = useMemo(() => countDiff(session.files), [session.files]);
  return isSession && !session.unsupported ? sessionStat : undefined;
}

/** The count to show for a workspace: the session's when compared, else the checkout's for the chosen part. */
export function useWorkspaceShownDiffStat(input: {
  serverId: string;
  workspaceId: string;
  checkoutStat: DiffCount | null;
  active: boolean;
}): DiffCount | null {
  const sessionStat = useWorkspaceSessionDiffStat(input);
  const partStat = useWorktreePartDiffStat(input);
  if (sessionStat !== undefined) return sessionStat;
  return partStat === undefined ? input.checkoutStat : partStat;
}

/** The worktree's committed or uncommitted count when one of them is compared; undefined for All. */
function useWorktreePartDiffStat(input: {
  serverId: string;
  workspaceId: string;
  active: boolean;
}): DiffCount | null | undefined {
  const { comparison } = useWorkingDiffComparison({
    serverId: input.serverId,
    workspaceId: input.workspaceId,
    cwd: "",
  });
  const cwd = useWorkspaceDirectory(input.serverId, input.workspaceId) ?? "";
  const checkoutPart = checkoutModeOf(comparison);
  const part = sessionModeOf(comparison) === null && checkoutPart !== "all" ? checkoutPart : null;
  const checkout = useCheckoutDiffQuery({
    serverId: input.serverId,
    cwd,
    mode: part ?? "uncommitted",
    ignoreWhitespace: false,
    enabled: input.active && part !== null && cwd.length > 0,
  });
  const stat = useMemo(() => countDiff(checkout.files), [checkout.files]);
  return part === null ? undefined : stat;
}
