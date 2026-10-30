// Changed for Groupon Desk (fork of Paseo, Apache-2.0): "session" comparisons (what the workspace's sessions changed: all, committed, uncommitted), and a default the person may set to it; the latest pick goes last, so a kept list keeps the newest.
/** Groupon Desk: the "session" three read what the workspace's sessions changed; a person may make "session" the default. */
export type WorkingDiffComparison =
  | "session"
  | "session-committed"
  | "session-uncommitted"
  | "uncommitted"
  | "base"
  | "all";

export type SessionChangesMode = "all" | "committed" | "uncommitted";

/** Groupon Desk: which part of the sessions' changes a comparison reads; null for the worktree's own. */
export function sessionModeOf(comparison: WorkingDiffComparison): SessionChangesMode | null {
  if (comparison === "session") return "all";
  if (comparison === "session-committed") return "committed";
  if (comparison === "session-uncommitted") return "uncommitted";
  return null;
}

export function sessionComparisonOf(mode: SessionChangesMode): WorkingDiffComparison {
  if (mode === "committed") return "session-committed";
  return mode === "uncommitted" ? "session-uncommitted" : "session";
}

/** The worktree comparison standing in for a session one, on a daemon that cannot read the sessions. */
export function checkoutModeOf(comparison: WorkingDiffComparison): "uncommitted" | "base" | "all" {
  if (comparison === "session") return "all";
  if (comparison === "session-committed") return "base";
  if (comparison === "session-uncommitted") return "uncommitted";
  return comparison;
}

export interface WorkingDiffComparisonOverride {
  comparison: WorkingDiffComparison;
}

export interface WorkingDiffComparisonState {
  overrides: Record<string, WorkingDiffComparisonOverride>;
}

export interface WorkingDiffCheckoutIdentity {
  serverId: string;
  workspaceId?: string | null;
  cwd: string;
}

function normalizeCwd(cwd: string): string {
  const trimmed = cwd.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

export function workingDiffComparisonKey(input: WorkingDiffCheckoutIdentity): string {
  const workspaceId = input.workspaceId?.trim();
  const checkout = workspaceId
    ? `workspace=${encodeURIComponent(workspaceId)}`
    : `cwd=${encodeURIComponent(normalizeCwd(input.cwd))}`;
  return `working-diff:server=${encodeURIComponent(input.serverId.trim())}:${checkout}`;
}

export function selectWorkingDiffComparisonInState(
  state: WorkingDiffComparisonState,
  input: WorkingDiffCheckoutIdentity & {
    comparison: WorkingDiffComparison;
  },
): WorkingDiffComparisonState {
  // The latest pick goes last, so the persisted store keeps the most recent ones.
  const key = workingDiffComparisonKey(input);
  const { [key]: _previous, ...others } = state.overrides;
  return { overrides: { ...others, [key]: { comparison: input.comparison } } };
}

export function resolveWorkingDiffComparisonFromState(
  state: WorkingDiffComparisonState,
  input: WorkingDiffCheckoutIdentity,
  // Groupon Desk: the default is the person's (`changesDefaultComparison`), All changes unless set.
  fallback: WorkingDiffComparison = "all",
): WorkingDiffComparison {
  return state.overrides[workingDiffComparisonKey(input)]?.comparison ?? fallback;
}
