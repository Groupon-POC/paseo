// Added for Groupon Desk (fork of Paseo, Apache-2.0): New workspace reads the repository's target branch for new worktrees.

import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { readProjectSettings } from "./desk-plugin-rpc";
import { bareBranchName } from "./default-base-branch";
import { repositoryStandardQueryKey, useRepositoryStandard } from "./repository-settings";

/**
 * The repository's target branch (`default-base-branch.ts`) while New workspace offers a worktree;
 * `ensure` waits for it, so a workspace started before the read lands still cuts from it.
 */
export function useProjectBaseBranch(input: {
  client: DaemonClient | null;
  serverId: string;
  repoRoot: string | null;
  enabled: boolean;
}): { branch: string | null; ensure: () => Promise<string | null> } {
  const { client, serverId } = input;
  const repoRoot = input.enabled ? (input.repoRoot ?? "") : "";
  const queryClient = useQueryClient();
  const standard = useRepositoryStandard(client, serverId, repoRoot);
  const branch = bareBranchName(standard.answer?.settings?.targetBranch);

  const ensure = useCallback(async (): Promise<string | null> => {
    if (!client || !repoRoot) return null;
    const answer = await queryClient
      .fetchQuery({
        queryKey: repositoryStandardQueryKey(serverId, repoRoot),
        queryFn: () => readProjectSettings(client, repoRoot, false),
        staleTime: 60_000,
      })
      .catch(() => null);
    return bareBranchName(answer?.settings?.targetBranch);
  }, [client, queryClient, repoRoot, serverId]);

  return { branch, ensure };
}
