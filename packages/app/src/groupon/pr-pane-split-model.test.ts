// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for how the pull request pane shares its height between the checks and the activity.
import { describe, expect, it } from "vitest";
import { prPaneSplitLayout } from "./pr-pane-split-model";

const pane = { checksShare: null, paneHeight: 600 };

describe("prPaneSplitLayout", () => {
  it("puts a folded activity at the pane's foot, under checks that take the rest", () => {
    expect(prPaneSplitLayout({ ...pane, checksOpen: true, activityOpen: false })).toEqual({
      checks: { kind: "fill" },
      activity: { kind: "foot" },
      handle: false,
    });
    expect(prPaneSplitLayout({ ...pane, checksOpen: false, activityOpen: false })).toEqual({
      checks: { kind: "header" },
      activity: { kind: "foot" },
      handle: false,
    });
  });

  it("gives the activity the rest under folded checks, with no handle", () => {
    expect(prPaneSplitLayout({ ...pane, checksOpen: false, activityOpen: true })).toEqual({
      checks: { kind: "header" },
      activity: { kind: "fill" },
      handle: false,
    });
  });

  it("with both open, sizes the checks by their content until the handle is dragged", () => {
    const open = { checksOpen: true, activityOpen: true };
    expect(prPaneSplitLayout({ ...pane, ...open })).toEqual({
      checks: { kind: "content" },
      activity: { kind: "fill" },
      handle: true,
    });
    expect(prPaneSplitLayout({ ...open, checksShare: 0.7, paneHeight: 600 }).checks).toEqual({
      kind: "height",
      height: 420,
    });
    expect(prPaneSplitLayout({ ...open, checksShare: 0.99, paneHeight: 600 }).checks).toEqual({
      kind: "height",
      height: 540,
    });
    expect(prPaneSplitLayout({ ...open, checksShare: 0.7, paneHeight: 0 }).checks).toEqual({
      kind: "content",
    });
  });
});
