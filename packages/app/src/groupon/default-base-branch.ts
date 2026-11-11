// Added for Groupon Desk (fork of Paseo, Apache-2.0): the branch New workspace cuts a worktree from when the person picks none.

/**
 * A worktree branches off the repository's `[git] target_branch` (`.groupon/desk.toml`, `staging`
 * in the monorepo), the branch its pull requests go to. Paseo's own default, the branch the
 * checkout sits on, stays for a repository without it. The row is origin's ref: the daemon
 * refreshes a remote-tracking base before the cut, so the worktree starts at the remote tip.
 * Pure, so it is tested without React.
 */

import type { PickerItem } from "@/screens/new-workspace-picker-item";

/** `origin/staging`, `refs/heads/staging` and `refs/remotes/origin/staging` all name `staging`. */
export function bareBranchName(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  const name = trimmed.replace(/^refs\/(heads|remotes\/origin)\//, "").replace(/^origin\//, "");
  return name.length > 0 ? name : null;
}

export function projectBasePickerItem(branch: string | null): PickerItem | null {
  if (!branch) return null;
  return {
    kind: "branch",
    name: branch,
    refName: `refs/remotes/origin/${branch}`,
    accessibilityLabel: `${branch}, origin branch, the repository's target branch`,
  };
}
