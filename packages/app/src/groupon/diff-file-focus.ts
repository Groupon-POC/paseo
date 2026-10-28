// Added for Groupon Desk (fork of Paseo, Apache-2.0): the changed file a workspace's Changes views are on, shared by the panel's tree and the diff viewer.

/**
 * One file per workspace that the Changes views agree on: the file picked in the panel's tree, or
 * the one scrolled to the top of the diff viewer. The tree marks it, and the diff viewer can show
 * it alone (the "selected file only" switch, kept on this device in `preferences.ts`).
 *
 * Constraints:
 * - Kept in memory only: a reload starts again from the first file
 */

import { useCallback, useEffect, useMemo } from "react";
import { create } from "zustand";
import type { ParsedDiffFile } from "@/git/use-diff-query";
import {
  workingDiffComparisonKey,
  type WorkingDiffCheckoutIdentity,
} from "@/git/working-diff-comparison/state";
import { useGrouponPreferences } from "./preferences";

interface DiffFileFocusState {
  paths: Record<string, string>;
  focus: (key: string, path: string) => void;
}

export const useDiffFileFocusStore = create<DiffFileFocusState>()((set) => ({
  paths: {},
  focus: (key, path) =>
    set((state) =>
      state.paths[key] === path ? state : { paths: { ...state.paths, [key]: path } },
    ),
}));

/** The files to show when only the selected one is wanted: it, or the first when none is. */
export function selectedFileOnly(
  files: ParsedDiffFile[],
  activePath: string | null,
): ParsedDiffFile[] {
  if (files.length <= 1) return files;
  const selected = files.find((file) => file.path === activePath) ?? files[0];
  return selected ? [selected] : files;
}

/** The workspace's focused changed file, and the files the diff viewer shows by the switch. */
export function useDiffFileFocus(
  input: WorkingDiffCheckoutIdentity & {
    files: ParsedDiffFile[];
    /** A file the viewer was asked to scroll to; it becomes the focused one. */
    request: { path: string; revision: number } | null;
  },
) {
  const key = workingDiffComparisonKey(input);
  const activePath = useDiffFileFocusStore((state) => state.paths[key] ?? null);
  const focus = useDiffFileFocusStore((state) => state.focus);
  const onlySelected = useGrouponPreferences((state) => state.diffSelectedFileOnly ?? false);
  const setOnlySelected = useGrouponPreferences((state) => state.setDiffSelectedFileOnly);
  const focusPath = useCallback((path: string) => focus(key, path), [focus, key]);
  const requestedPath = input.request?.path;
  const requestRevision = input.request?.revision;
  useEffect(() => {
    if (requestedPath) focus(key, requestedPath);
  }, [focus, key, requestedPath, requestRevision]);
  const shownFiles = useMemo(
    () => (onlySelected ? selectedFileOnly(input.files, activePath) : input.files),
    [activePath, input.files, onlySelected],
  );
  const toggleOnlySelected = useCallback(
    () => setOnlySelected(!onlySelected),
    [onlySelected, setOnlySelected],
  );
  return { activePath, focusPath, shownFiles, onlySelected, toggleOnlySelected };
}
