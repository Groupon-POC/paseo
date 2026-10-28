// Added for Groupon Desk (fork of Paseo, Apache-2.0): the agent output's width handles, which a phone does not show.
import type { ReactElement } from "react";

/** The web build draws handles at the output's edges (`stream-width-handles.web.tsx`); a phone has none. */
export function StreamWidthHandles(_props: {
  paneWidth: number;
  streamWidth: number;
  contentMaxWidth: number;
  onCommit: (share: number | null) => void;
}): ReactElement | null {
  return null;
}
