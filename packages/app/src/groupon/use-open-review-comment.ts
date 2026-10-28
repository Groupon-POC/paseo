// Added for Groupon Desk (fork of Paseo, Apache-2.0): a review comment in the chat opens the diff at its line, in the comparison it was made on.

import { useCallback } from "react";
import { selectWorkingDiffComparison } from "@/git/working-diff-comparison";
import { workingDiffComparisonKey } from "@/git/working-diff-comparison/state";
import { useSettings } from "@/hooks/use-settings";
import { useSessionStore } from "@/stores/session-store";
import { useWorkspaceDirectory } from "@/stores/session-store-hooks";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import { openPreferredWorkspaceTarget } from "@/workspace-tabs/open-beside";
import { useDiffFileFocusStore } from "./diff-file-focus";
import {
  reviewComparisonOf,
  type ReviewAttachment,
  type ReviewAttachmentComment,
} from "./review-attachment-model";

/**
 * Opens the agent's workspace's diff on a review comment's file, scrolled to its line and marked,
 * in the comparison the review was made on; where the person opens diffs (beside or in place) is
 * their own setting. Null when the agent belongs to no workspace this window knows.
 */
export function useOpenReviewComment(
  serverId: string | undefined,
  agentId: string | undefined,
): ((attachment: ReviewAttachment, comment: ReviewAttachmentComment) => void) | null {
  const workspaceId = useSessionStore((state) => {
    if (!serverId || !agentId) return null;
    const session = state.sessions[serverId];
    const agent = session?.agents.get(agentId) ?? session?.agentDetails.get(agentId);
    return agent?.workspaceId ?? null;
  });
  const cwd = useWorkspaceDirectory(serverId ?? null, workspaceId);
  const openInSidePane = useSettings((settings) => settings.openInSidePane);
  const open = useCallback(
    (attachment: ReviewAttachment, comment: ReviewAttachmentComment) => {
      if (!serverId || !workspaceId) return;
      const identity = { serverId, workspaceId, cwd: cwd ?? attachment.cwd };
      selectWorkingDiffComparison({ ...identity, comparison: reviewComparisonOf(attachment) });
      const revision = Date.now();
      useDiffFileFocusStore.getState().focusLine(workingDiffComparisonKey(identity), {
        path: comment.filePath,
        side: comment.side,
        lineNumber: comment.lineNumber,
        revision,
      });
      openPreferredWorkspaceTarget({
        workspaceKey: buildWorkspaceTabPersistenceKey({ serverId, workspaceId }),
        target: { kind: "working_diff", focusPath: comment.filePath, focusRequestId: revision },
        source: "diffs",
        preferences: openInSidePane,
      });
    },
    [cwd, openInSidePane, serverId, workspaceId],
  );
  return workspaceId ? open : null;
}
