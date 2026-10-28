// Changed for Groupon Desk (fork of Paseo, Apache-2.0): the comparison a workspace starts on is the person's default (`groupon/preferences.ts`).
import { useCallback } from "react";
import { create } from "zustand";
import { useGrouponPreferences } from "@/groupon/preferences";
import {
  resolveWorkingDiffComparisonFromState,
  selectWorkingDiffComparisonInState,
  type WorkingDiffCheckoutIdentity,
  type WorkingDiffComparison,
  type WorkingDiffComparisonState,
} from "./state";

interface WorkingDiffComparisonStore extends WorkingDiffComparisonState {
  select: (
    input: WorkingDiffCheckoutIdentity & {
      comparison: WorkingDiffComparison;
    },
  ) => void;
}

const useWorkingDiffComparisonStore = create<WorkingDiffComparisonStore>((set) => ({
  overrides: {},
  select: (input) => set((state) => selectWorkingDiffComparisonInState(state, input)),
}));

export function useWorkingDiffComparison(input: WorkingDiffCheckoutIdentity): {
  comparison: WorkingDiffComparison;
  selectComparison: (comparison: WorkingDiffComparison) => void;
} {
  const { serverId, workspaceId, cwd } = input;
  const fallback = useGrouponPreferences((state) => state.changesDefaultComparison ?? "all");
  const comparison = useWorkingDiffComparisonStore((state) =>
    resolveWorkingDiffComparisonFromState(state, { serverId, workspaceId, cwd }, fallback),
  );
  const select = useWorkingDiffComparisonStore((state) => state.select);
  const selectComparison = useCallback(
    (next: WorkingDiffComparison) => select({ serverId, workspaceId, cwd, comparison: next }),
    [cwd, select, serverId, workspaceId],
  );
  return { comparison, selectComparison };
}

export function selectWorkingDiffComparison(
  input: WorkingDiffCheckoutIdentity & {
    comparison: WorkingDiffComparison;
  },
): void {
  useWorkingDiffComparisonStore.getState().select(input);
}

export function resolveWorkingDiffComparison(
  input: WorkingDiffCheckoutIdentity,
): WorkingDiffComparison {
  return resolveWorkingDiffComparisonFromState(
    useWorkingDiffComparisonStore.getState(),
    input,
    useGrouponPreferences.getState().changesDefaultComparison ?? "all",
  );
}

export function resetWorkingDiffComparisons(): void {
  useWorkingDiffComparisonStore.setState({ overrides: {} });
}
