// Added for Groupon Desk (fork of Paseo, Apache-2.0): the agent output's width, a share of the chat's pane that the column's edge handles set.

/**
 * The person widens the agent output by dragging handles at its edges (`stream-width-handles`).
 * What is kept is a share of the pane (one for every chat on this device, `preferences.ts`), so
 * chats in panes of different widths look alike; each chat turns it into pixels for its own pane
 * and hands them to the chat list through React, as the content width setting does, never through
 * CSS the list's virtualizer does not see (`groupon-desk-ui-pitfalls`: rows overlapped and the list
 * looped). The composer keeps the content width.
 *
 * Constraints:
 * - Never narrower than the content width, never wider than the pane less a tenth on each side
 * - Pixels move in steps, so a pane resized by a pixel does not re-lay out every row
 */

import { createContext, useContext, useMemo } from "react";

/** The share of the pane left free on each side of the widest output. */
export const STREAM_SIDE_MARGIN_SHARE = 0.1;
/** The output's width moves in these steps. */
export const STREAM_WIDTH_STEP_PX = 16;

/** The widest the output may be in a pane this wide. */
export function streamWidthCeiling(paneWidth: number): number {
  return Math.floor(paneWidth * (1 - 2 * STREAM_SIDE_MARGIN_SHARE));
}

/** Whether a pane is wide enough for the output to grow past the content width at all. */
export function canWidenStream(paneWidth: number, contentMaxWidth: number): boolean {
  return streamWidthCeiling(paneWidth) > contentMaxWidth + STREAM_WIDTH_STEP_PX;
}

/** A width kept within the content width and the pane's ceiling. */
export function clampStreamWidth(
  width: number,
  paneWidth: number,
  contentMaxWidth: number,
): number {
  return Math.min(
    Math.max(width, contentMaxWidth),
    Math.max(contentMaxWidth, streamWidthCeiling(paneWidth)),
  );
}

/** The output's width in a pane: the content width with no share kept, else the share in steps. */
export function resolveStreamMaxWidth(input: {
  share: number | null;
  paneWidth: number;
  contentMaxWidth: number;
}): number {
  if (input.share === null || input.paneWidth <= 0) return input.contentMaxWidth;
  const stepped =
    Math.round((input.share * input.paneWidth) / STREAM_WIDTH_STEP_PX) * STREAM_WIDTH_STEP_PX;
  return clampStreamWidth(stepped, input.paneWidth, input.contentMaxWidth);
}

/** The share to keep for a width dragged to; null (the content width) when it is back there. */
export function shareForStreamWidth(
  width: number,
  paneWidth: number,
  contentMaxWidth: number,
): number | null {
  if (paneWidth <= 0 || width <= contentMaxWidth + STREAM_WIDTH_STEP_PX / 2) return null;
  return Math.min(1 - 2 * STREAM_SIDE_MARGIN_SHARE, width / paneWidth);
}

const StreamWidthContext = createContext<number | null>(null);

/** Gives the chat list's rows the output's width; null keeps the content width of their styles. */
export const StreamWidthProvider = StreamWidthContext.Provider;

/** A row's width override, or null to keep the content width its stylesheet sets. */
export function useStreamRowWidthStyle(): { maxWidth: number } | null {
  const width = useContext(StreamWidthContext);
  return useMemo(() => (width === null ? null : { maxWidth: width }), [width]);
}
