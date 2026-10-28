// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for counting what a session changed.

import { describe, expect, it } from "vitest";
import { countDiff } from "./use-session-diff-stat";

describe("the count of what a session changed", () => {
  it("adds every file's lines, and is nothing when nothing changed", () => {
    expect(
      countDiff([
        { additions: 3, deletions: 1 },
        { additions: 0, deletions: 4 },
      ]),
    ).toEqual({ additions: 3, deletions: 5 });
    expect(countDiff([{ additions: 0, deletions: 0 }])).toBeNull();
    expect(countDiff([])).toBeNull();
  });
});
