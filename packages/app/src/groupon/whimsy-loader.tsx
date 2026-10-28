// Added for Groupon Desk (fork of Paseo, Apache-2.0): the working loader on a phone, which keeps Paseo's own.
import type { ReactElement } from "react";

/** The web build draws TARS's blob and a typed word (`whimsy-loader.web.tsx`); a phone keeps `fallback`. */
export function WhimsyLoader({
  fallback,
}: {
  fallback: ReactElement;
  size?: number;
  wordless?: boolean;
}): ReactElement {
  return fallback;
}
