// Added for Groupon Desk (fork of Paseo, Apache-2.0): whether a block under the composer folds away, from what the composer holds.

import { useEffect, useState, useSyncExternalStore } from "react";
import type { ComposerTextSource } from "@/composer/text-source";

export const FOLD_DELAY_MS = 350;

/** Folds a moment after the person starts writing, so a stray key moves nothing; opens at once when the text is gone. */
export function useFoldedWhileTyping(source: ComposerTextSource): boolean {
  const typing = useSyncExternalStore(
    source.subscribe,
    () => source.getSnapshot().trim().length > 0,
  );
  const [folded, setFolded] = useState(typing);
  useEffect(() => {
    if (!typing) {
      setFolded(false);
      return undefined;
    }
    const timer = setTimeout(() => setFolded(true), FOLD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [typing]);
  return folded;
}
