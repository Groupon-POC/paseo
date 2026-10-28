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

interface ComparedStat {
  stat: DiffCount | null;
  loading: boolean;
}

/**
 * What the workspace's sessions changed in all, when its Changes views compare the session (the
 * default); undefined when they compare the checkout, or the Mac's daemon predates the session
 * comparison. The session is read only while `active`.
 */
function useWorkspaceSessionDiffStat(input: {
  serverId: string;
  workspaceId: string;
  active: boolean;
}): ComparedStat | undefined {
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
  const stat = useMemo(() => countDiff(session.files), [session.files]);
  return isSession && !session.unsupported ? { stat, loading: session.isLoading } : undefined;
}

/**
 * The count to show for a workspace: the session's when compared, else the checkout's for the
 * chosen part; null when the comparison has no changes, undefined while it is still being read.
 */
export function useWorkspaceShownDiffStat(input: {
  serverId: string;
  workspaceId: string;
  checkoutStat: DiffCount | null;
  active: boolean;
  /** A base the workspace's agent asked for: the checkout's own count then no longer answers "all". */
  baseRef?: string | null;
}): DiffCount | null | undefined {
  const session = useWorkspaceSessionDiffStat(input);
  const part = useWorktreePartDiffStat(input);
  const shown = session ?? part;
  if (shown === undefined) return input.checkoutStat;
  return shown.loading ? undefined : shown.stat;
}

/** The worktree's committed or uncommitted count when one of them is compared; undefined for All. */
function useWorktreePartDiffStat(input: {
  serverId: string;
  workspaceId: string;
  active: boolean;
  baseRef?: string | null;
}): ComparedStat | undefined {
  const { comparison } = useWorkingDiffComparison({
    serverId: input.serverId,
    workspaceId: input.workspaceId,
    cwd: "",
  });
  const cwd = useWorkspaceDirectory(input.serverId, input.workspaceId) ?? "";
  const checkoutPart = checkoutModeOf(comparison);
  const ownBase = !input.baseRef;
  const part =
    sessionModeOf(comparison) === null && (checkoutPart !== "all" || !ownBase)
      ? checkoutPart
      : null;
  const checkout = useCheckoutDiffQuery({
    serverId: input.serverId,
    cwd,
    mode: part ?? "uncommitted",
    ...(input.baseRef ? { baseRef: input.baseRef } : {}),
    ignoreWhitespace: false,
    enabled: input.active && part !== null && cwd.length > 0,
  });
  const stat = useMemo(() => countDiff(checkout.files), [checkout.files]);
  return part === null ? undefined : { stat, loading: checkout.isLoading };
}
