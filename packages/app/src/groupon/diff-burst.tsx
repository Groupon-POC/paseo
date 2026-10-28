// Added for Groupon Desk (fork of Paseo, Apache-2.0): the lines a change added, drawn into the diff pill; a phone shows none.
import type { ReactElement } from "react";

/** The web build draws the burst (`diff-burst.web.tsx`); a phone has the pill's own count. */
export function DiffBurst(_props: {
  additions: number;
  deletions: number;
  scope: string;
}): ReactElement | null {
  return null;
}
