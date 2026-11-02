// Added for Groupon Desk (fork of Paseo, Apache-2.0): what a worktree has not committed yet, for the archive warning, which otherwise shows the whole branch's diff against its base.

/** The Groupon Desk plugin RPC the window calls: `{ workspaceId }`, answered `{ stat: { additions, deletions } | null }`. */
export const UNCOMMITTED_STAT_RPC = "groupon-desk.checkout.uncommitted-stat";

export function uncommittedStatRequestOf(input: unknown): { workspaceId: string } {
  const workspaceId =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>).workspaceId
      : undefined;
  if (typeof workspaceId !== "string" || workspaceId.trim() === "") {
    throw new Error("workspaceId is required");
  }
  return { workspaceId };
}
