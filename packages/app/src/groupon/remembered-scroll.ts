// Added for Groupon Desk (fork of Paseo, Apache-2.0): a page's scroll position kept across an appearance remount.

import { useCallback, useRef } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

/** What both React Native's ScrollView and the keyboard-aware one expose. */
interface Scrollable {
  scrollTo(options: { y: number; animated: boolean }): void;
}

// An appearance change remounts every screen's content (`AppearanceStyleBoundary`), so a page
// that wants to stay where the person was reads its offset back from here.
const offsets = new Map<string, number>();

export function useRememberedScroll(key: string | undefined) {
  const scroller = useRef<Scrollable | null>(null);
  const restored = useRef(false);
  const ref = useCallback((instance: Scrollable | null) => {
    scroller.current = instance;
  }, []);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (key) offsets.set(key, event.nativeEvent.contentOffset.y);
    },
    [key],
  );

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      if (!key || restored.current) return;
      const y = offsets.get(key) ?? 0;
      if (y <= 0) {
        restored.current = true;
        return;
      }
      if (height < y) return;
      restored.current = true;
      scroller.current?.scrollTo({ y, animated: false });
    },
    [key],
  );

  return key ? { ref, onScroll, onContentSizeChange, scrollEventThrottle: 32 } : {};
}
