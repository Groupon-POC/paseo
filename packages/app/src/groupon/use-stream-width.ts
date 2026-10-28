// Added for Groupon Desk (fork of Paseo, Apache-2.0): one chat's agent output width, from the share kept for every chat and its own pane.

import { useCallback, useEffect, useRef, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { isWeb } from "@/constants/platform";
import { useGrouponPreferences } from "./preferences";
import { canWidenStream, resolveStreamMaxWidth } from "./stream-width";

/** A pane being resized is read again only once it rests this long, so rows lay out once. */
const PANE_SETTLE_MS = 150;

/**
 * The output's width in this chat's pane (`stream-width.ts`), the pane's width it came from (read
 * from `onPaneLayout`), and whether the handles have room to widen it. Only the web build's wide
 * layout widens it; a phone and a compact window keep the content width.
 */
export function useStreamWidth(input: { contentMaxWidth: number; compact: boolean }) {
  const enabled = isWeb && !input.compact;
  const share = useGrouponPreferences((state) => state.streamWidthShare ?? null);
  const setShare = useGrouponPreferences((state) => state.setStreamWidthShare);
  const [paneWidth, setPaneWidth] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPaneLayout = useCallback((event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width);
    if (timerRef.current) clearTimeout(timerRef.current);
    setPaneWidth((current) => {
      if (current === 0) return width;
      timerRef.current = setTimeout(() => setPaneWidth(width), PANE_SETTLE_MS);
      return current;
    });
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
    /** The rows' width when it differs from the content width their styles set; else null. */
    override: maxWidth === input.contentMaxWidth ? null : maxWidth,
    paneWidth,
    onPaneLayout,
    canWiden: enabled && canWidenStream(paneWidth, input.contentMaxWidth),
    commit: setShare,
  };
}
