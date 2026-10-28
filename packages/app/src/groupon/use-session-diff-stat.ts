// Added for Groupon Desk (fork of Paseo, Apache-2.0): the +/− count of what a workspace's sessions changed, for the composer's pill and the sidebar's hover card.

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
  const isSession = comparison === "session";
  const session = useSessionChanges({
    serverId: input.serverId,
    workspaceId: input.workspaceId,
    enabled: input.active && isSession,
  });
  const sessionStat = useMemo(() => countDiff(session.files), [session.files]);
  return isSession && !session.unsupported ? sessionStat : undefined;
}

/** The count to show for a workspace: the session's when compared, else the checkout's own. */
export function useWorkspaceShownDiffStat(input: {
  serverId: string;
  workspaceId: string;
  checkoutStat: DiffCount | null;
  active: boolean;
}): DiffCount | null {
  const sessionStat = useWorkspaceSessionDiffStat(input);
  return sessionStat === undefined ? input.checkoutStat : sessionStat;
}
