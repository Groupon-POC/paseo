// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for the changed file the Changes views agree on.

import { describe, expect, it } from "vitest";
import type { ParsedDiffFile } from "@/git/use-diff-query";
import { selectedFileOnly, useDiffFileFocusStore } from "./diff-file-focus";

const file = (path: string): ParsedDiffFile => ({
  path,
  isNew: false,
  isDeleted: false,
  additions: 1,
  deletions: 0,
  hunks: [],
});

describe("the changed file the Changes views agree on", () => {
  it("shows the selected file alone, the first when none is selected or it is gone", () => {
    const files = [file("a.ts"), file("b.ts"), file("c.ts")];

    expect(selectedFileOnly(files, "b.ts").map((f) => f.path)).toEqual(["b.ts"]);
    expect(selectedFileOnly(files, null).map((f) => f.path)).toEqual(["a.ts"]);
    expect(selectedFileOnly(files, "gone.ts").map((f) => f.path)).toEqual(["a.ts"]);
    expect(selectedFileOnly([], "a.ts")).toEqual([]);
  });

  it("keeps one focused file per workspace and leaves the state alone when it is already focused", () => {
    const store = useDiffFileFocusStore;
    store.getState().focus("ws-1", "a.ts");
    store.getState().focus("ws-2", "b.ts");
    const before = store.getState();
    store.getState().focus("ws-1", "a.ts");

    expect(store.getState()).toBe(before);
    expect(store.getState().paths).toMatchObject({ "ws-1": "a.ts", "ws-2": "b.ts" });
  });
});
