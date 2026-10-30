// Changed for Groupon Desk (fork of Paseo, Apache-2.0): the comparison a workspace starts on is the person's default (`groupon/preferences.ts`); it is kept across restarts of the window, per workspace.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback } from "react";
import { z } from "zod";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";
import { useGrouponPreferences } from "@/groupon/preferences";
import {
  resolveWorkingDiffComparisonFromState,
  selectWorkingDiffComparisonInState,
  type WorkingDiffCheckoutIdentity,
  type WorkingDiffComparison,
  type WorkingDiffComparisonState,
  workingDiffComparisonKey,
} from "./state";

interface WorkingDiffComparisonStore extends WorkingDiffComparisonState {
  /** Groupon Desk: each workspace's last agent request taken (`groupon/requested-compare.ts`), by key. */
  appliedRequests: Record<string, string>;
  select: (
    input: WorkingDiffCheckoutIdentity & {
      comparison: WorkingDiffComparison;
    },
  ) => void;
}

// Groupon Desk: a workspace keeps the comparison the person picked across restarts of the window.
const PersistedComparisonsSchema = z.object({
  overrides: z.record(
    z.string(),
    z.object({
      comparison: z.enum([
        "session",
        "session-committed",
        "session-uncommitted",
        "uncommitted",
        "base",
        "all",
      ]),
    }),
  ),
  appliedRequests: z.record(z.string(), z.string()).optional(),
});
const KEPT_COMPARISONS = 300;

const useWorkingDiffComparisonStore = create<WorkingDiffComparisonStore>()(
  persist(
    (set) => ({
      overrides: {},
      appliedRequests: {},
      select: (input) => set((state) => selectWorkingDiffComparisonInState(state, input)),
    }),
    {
      name: "groupon-desk-diff-comparisons",
      storage: createValidatedPersistStorage(AsyncStorage, PersistedComparisonsSchema),
      partialize: (state) => ({
        overrides: Object.fromEntries(Object.entries(state.overrides).slice(-KEPT_COMPARISONS)),
        appliedRequests: Object.fromEntries(
          Object.entries(state.appliedRequests).slice(-KEPT_COMPARISONS),
        ),
      }),
    },
  ),
);

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
  useWorkingDiffComparisonStore.setState({ overrides: {}, appliedRequests: {} });
}

/** Groupon Desk: takes an agent's request for a workspace's comparison once, across restarts; a later pick of the person's stays. */
export function applyRequestedComparison(
  input: WorkingDiffCheckoutIdentity & { comparison: WorkingDiffComparison; requestedAt: string },
): void {
  const store = useWorkingDiffComparisonStore.getState();
  const key = workingDiffComparisonKey(input);
  if (store.appliedRequests[key] === input.requestedAt) return;
  store.select(input);
  useWorkingDiffComparisonStore.setState((state) => ({
    appliedRequests: { ...state.appliedRequests, [key]: input.requestedAt },
  }));
}
