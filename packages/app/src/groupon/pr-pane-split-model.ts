// Added for Groupon Desk (fork of Paseo, Apache-2.0): how the pull request pane shares its height between the checks and the activity.

/** Each block's share of the pane: a fixed height, as tall as its content up to half, the rest, or its header alone. */
export type PrPaneBlock =
  | { kind: "height"; height: number }
  | { kind: "content" }
  | { kind: "fill" }
  | { kind: "header" }
  | { kind: "foot" };

export interface PrPaneSplitLayout {
  checks: PrPaneBlock;
  activity: PrPaneBlock;
  /** The handle between the blocks, only while both are open. */
  handle: boolean;
}

/** A block keeps at least this share of the pane when the handle is dragged. */
export const PR_PANE_MIN_SHARE = 0.1;

export function clampChecksShare(share: number): number {
  return Math.min(1 - PR_PANE_MIN_SHARE, Math.max(PR_PANE_MIN_SHARE, share));
}

/**
 * Folded activity sits at the pane's foot, under checks that take the rest; with both open the
 * checks take the share the person dragged to, else their content's height.
 */
export function prPaneSplitLayout(input: {
  checksOpen: boolean;
  activityOpen: boolean;
  checksShare: number | null;
  paneHeight: number;
}): PrPaneSplitLayout {
  const { checksOpen, activityOpen, checksShare, paneHeight } = input;
  if (!activityOpen) {
    return {
      checks: checksOpen ? { kind: "fill" } : { kind: "header" },
      activity: { kind: "foot" },
      handle: false,
    };
  }
  if (!checksOpen) return { checks: { kind: "header" }, activity: { kind: "fill" }, handle: false };
  const checks: PrPaneBlock =
    checksShare !== null && paneHeight > 0
      ? { kind: "height", height: Math.round(clampChecksShare(checksShare) * paneHeight) }
      : { kind: "content" };
  return { checks, activity: { kind: "fill" }, handle: true };
}
