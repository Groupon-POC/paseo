// Added for Groupon Desk (fork of Paseo, Apache-2.0): the Changes views' diff, the checkout's or the session's, by the comparison chosen.

import { checkoutModeOf, sessionModeOf } from "@/git/working-diff-comparison/state";
import { useCallback } from "react";
import { useCheckoutDiffQuery } from "@/git/use-diff-query";
import type { WorkingDiffComparison } from "@/git/working-diff-comparison/state";
import { sessionFileTarget, type SessionChangesRepo } from "./session-changes-model";
import { useSessionChanges } from "./use-session-changes";

/**
 * The diff a Changes view shows: for "session" what the workspace's sessions changed
 * (`use-session-changes.ts`), else the checkout's own diff for that comparison. A view without a
 * workspace has no sessions and reads the checkout's whole diff, as does a Mac whose daemon predates
 * the session comparison.
 */
export function useComparedDiff(input: {
  serverId: string;
  workspaceId?: string;
  cwd: string;
  comparison: WorkingDiffComparison;
  baseRef?: string;
  ignoreWhitespace: boolean;
  enabled: boolean;
  isGit: boolean;
  queryScope?: string;
}) {
  const sessionMode = sessionModeOf(input.comparison);
  const wantsSession = sessionMode !== null && Boolean(input.workspaceId);
  const session = useSessionChanges({
    serverId: input.serverId,
    workspaceId: input.workspaceId,
    enabled: input.enabled && wantsSession,
    mode: sessionMode ?? "all",
  });
  // A Mac whose daemon predates the session comparison shows its checkout's diff instead.
  const isSession = wantsSession && !session.unsupported;
  const checkoutMode = checkoutModeOf(input.comparison);
  const checkout = useCheckoutDiffQuery({
    serverId: input.serverId,
    cwd: input.cwd,
    mode: checkoutMode,
    baseRef: input.baseRef,
    ignoreWhitespace: input.ignoreWhitespace,
    enabled: input.enabled && input.isGit && !isSession,
    queryScope: input.queryScope,
  });
  const shown = isSession ? session : checkout;
  return {
    files: shown.files,
    payloadError: shown.payloadError,
    diffTooLarge: shown.diffTooLarge,
    isLoading: shown.isLoading,
    isSession,
    checkoutMode,
    /** A review draft of the session's diff never mixes with one of the branch's. */
    reviewBaseRef: isSession ? "groupon-session" : input.baseRef,
    sessionRepos: session.repos,
    refetchSession: session.refetch,
  };
}

/**
 * A Changes view's "open this file" for the session comparison: the listed path becomes the path
 * the daemon opens (`sessionFileTarget`); any other comparison passes the path through.
 */
export function useSessionFileOpener(input: {
  open: ((path: string) => void) | undefined;
  isSession: boolean;
  repos: readonly SessionChangesRepo[];
  workspaceRoot: string;
}): ((path: string) => void) | undefined {
  const { open, isSession, repos, workspaceRoot } = input;
  const opener = useCallback(
    (path: string) => open?.(isSession ? sessionFileTarget(repos, path, workspaceRoot) : path),
    [isSession, open, repos, workspaceRoot],
  );
  return open ? opener : undefined;
}
