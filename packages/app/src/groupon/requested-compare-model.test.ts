// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for reading the comparison an agent asked for its workspace.

import { describe, expect, it } from "vitest";
import { requestedComparesOf } from "./requested-compare-model";

describe("requestedComparesOf", () => {
  it("reads each workspace's request, with its base", () => {
    const answer = {
      requests: {
        w1: {
          comparison: "all",
          baseRef: "origin/B2B/ENC-1/rc-19",
          requestedAt: "2026-10-28T19:00:00Z",
        },
        w2: { comparison: "uncommitted", baseRef: null, requestedAt: "2026-10-28T19:01:00Z" },
      },
    };

    expect(requestedComparesOf(answer)).toEqual({
      w1: {
        comparison: "all",
        baseRef: "origin/B2B/ENC-1/rc-19",
        requestedAt: "2026-10-28T19:00:00Z",
      },
      w2: { comparison: "uncommitted", baseRef: null, requestedAt: "2026-10-28T19:01:00Z" },
    });
  });

  it("drops a request the window cannot apply, and reads nothing from another shape", () => {
    const answer = {
      requests: { w1: { comparison: "everything", requestedAt: "x" }, w2: { comparison: "all" } },
    };

    expect(requestedComparesOf(answer)).toEqual({});
    expect(requestedComparesOf(null)).toEqual({});
    expect(requestedComparesOf({ workspaceIds: [] })).toEqual({});
  });
});
