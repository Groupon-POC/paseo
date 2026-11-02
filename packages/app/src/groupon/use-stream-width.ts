// Added for Groupon Desk (fork of Paseo, Apache-2.0): one chat's agent output width, from the share kept for every chat and its own pane.

import { useCallback, useEffect, useRef, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { isWeb } from "@/constants/platform";
import { useGrouponPreferences } from "./preferences";
import { canWidenStream, resolveStreamMaxWidth } from "./stream-width";

/** A pane being resized is read again only once it rests this long, so rows lay out once. */
const PANE_SETTLE_MS = 150;
/** The last pane width any chat measured: a new chat starts from it, so its first rows do not jump. */
let lastPaneWidth = 0;

/**
 * The output's width in this chat's pane (`stream-width.ts`), the pane's width it came from (read
 * from `onPaneLayout`), and whether the handles have room to widen it. Only the web build's wide
 * layout widens it; a phone and a compact window keep the content width.
 */
export function useStreamWidth(input: { contentMaxWidth: number; compact: boolean }) {
  const enabled = isWeb && !input.compact;
  const share = useGrouponPreferences((state) => state.streamWidthShare ?? null);
  const setShare = useGrouponPreferences((state) => state.setStreamWidthShare);
  const [paneWidth, setPaneWidth] = useState(lastPaneWidth);
  const measuredRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPaneLayout = useCallback((event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width);
    lastPaneWidth = width;
    if (timerRef.current) clearTimeout(timerRef.current);
    // This chat's own first measure lands at once; later ones wait for the pane to rest.
    if (!measuredRef.current) {
      measuredRef.current = true;
      setPaneWidth(width);
      return;
    }
    timerRef.current = setTimeout(() => setPaneWidth(width), PANE_SETTLE_MS);
  }, []);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );
  const maxWidth = enabled
    ? resolveStreamMaxWidth({ share, paneWidth, contentMaxWidth: input.contentMaxWidth })
    : input.contentMaxWidth;
  return {
    maxWidth,
    /** False only while a widened output waits for its pane's first measure; the list stays hidden. */
    ready: !enabled || share === null || paneWidth > 0,
    /** The rows' width when it differs from the content width their styles set; else null. */
    override: maxWidth === input.contentMaxWidth ? null : maxWidth,
    paneWidth,
    onPaneLayout,
    canWiden: enabled && canWidenStream(paneWidth, input.contentMaxWidth),
    commit: setShare,
  };
}
