// Added for Groupon Desk (fork of Paseo, Apache-2.0): the changed file a workspace's Changes views are on, shared by the panel's tree and the diff viewer.

/**
 * One file per workspace that the Changes views agree on: the file picked in the panel's tree, or
 * the one scrolled to the top of the diff viewer. The tree marks it, and the diff viewer can show
 * it alone (the "selected file only" switch, kept on this device in `preferences.ts`). A review
 * comment in the chat also asks for its line (`focusLine`), which the viewer scrolls to and marks.
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

/** A line of a file the diff viewer is asked to scroll to and mark (a review comment's line). */
export interface DiffLineFocus {
  path: string;
  side: "old" | "new";
  lineNumber: number;
  /** The diff tab's focus request it belongs to. */
  revision: number;
}

interface DiffFileFocusState {
  paths: Record<string, string>;
  lines: Record<string, DiffLineFocus>;
  focus: (key: string, path: string) => void;
  focusLine: (key: string, line: DiffLineFocus) => void;
}

export const useDiffFileFocusStore = create<DiffFileFocusState>()((set) => ({
  paths: {},
  lines: {},
  focus: (key, path) =>
    set((state) =>
      state.paths[key] === path ? state : { paths: { ...state.paths, [key]: path } },
    ),
  focusLine: (key, line) => set((state) => ({ lines: { ...state.lines, [key]: line } })),
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
  const lineFocus = useDiffFileFocusStore((state) => state.lines[key] ?? null);
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
  // The line asked for with this very request, never one left from an earlier one.
  const focusLine = useMemo(
    () =>
      lineFocus && lineFocus.path === requestedPath && lineFocus.revision === requestRevision
        ? { side: lineFocus.side, lineNumber: lineFocus.lineNumber }
        : undefined,
    [lineFocus, requestRevision, requestedPath],
  );
  return { activePath, focusPath, focusLine, shownFiles, onlySelected, toggleOnlySelected };
}
