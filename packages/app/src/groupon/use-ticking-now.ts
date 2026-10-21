// Added for Groupon Desk (fork of Paseo, Apache-2.0): a clock that re-renders once a second while a caption counts time.
import { useEffect, useState } from "react";

/** `Date.now()`, refreshed every second while `active`; frozen (no timer) otherwise. */
export function useTickingNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}
