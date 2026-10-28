// Changed for Groupon Desk (fork of Paseo, Apache-2.0): a "session" comparison (what the workspace's sessions changed), and a default the person may set to it.
/** Groupon Desk: "session", what the workspace's sessions changed; a person may make it the default. */
export type WorkingDiffComparison = "session" | "uncommitted" | "base" | "all";

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
  return {
    overrides: {
      ...state.overrides,
      [workingDiffComparisonKey(input)]: {
        comparison: input.comparison,
      },
    },
  };
}

export function resolveWorkingDiffComparisonFromState(
  state: WorkingDiffComparisonState,
  input: WorkingDiffCheckoutIdentity,
  // Groupon Desk: the default is the person's (`changesDefaultComparison`), All changes unless set.
  fallback: WorkingDiffComparison = "all",
): WorkingDiffComparison {
  return state.overrides[workingDiffComparisonKey(input)]?.comparison ?? fallback;
}
