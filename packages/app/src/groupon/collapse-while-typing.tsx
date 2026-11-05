// Added for Groupon Desk (fork of Paseo, Apache-2.0): a block under the composer folds away while the person writes, so the composer takes the page's middle.

import { useCallback, useEffect, type ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import type { ComposerTextSource } from "@/composer/text-source";
import { useFoldedWhileTyping } from "./use-folded-while-typing";

const TIMING = { duration: 320, easing: Easing.bezier(0.4, 0, 0.2, 1) };
const SLIDE = 8;
const NO_LIMIT = 10_000;

export function CollapseWhileTyping({
  textSource,
  children,
}: {
  textSource: ComposerTextSource;
  children: ReactNode;
}) {
  const folded = useFoldedWhileTyping(textSource);
  const openness = useSharedValue(folded ? 0 : 1);
  const openHeight = useSharedValue(0);

  useEffect(() => {
    openness.value = withTiming(folded ? 0 : 1, TIMING);
  }, [folded, openness]);

  const measure = useCallback(
    (event: LayoutChangeEvent) => {
      // Mid-fold the height is the animation's own, and would feed back into it.
      if (openness.value === 1) openHeight.value = event.nativeEvent.layout.height;
    },
    [openHeight, openness],
  );

  const foldStyle = useAnimatedStyle(() => {
    const open = openness.value;
    return {
      // Off the page once folded, so its buttons leave the tab order too.
      display: open === 0 ? "none" : "flex",
      maxHeight: open === 1 ? NO_LIMIT : openHeight.value * open,
      overflow: open === 1 ? "visible" : "hidden",
      opacity: open,
      transform: [{ translateY: (1 - open) * SLIDE }],
    };
  });

  return (
    <View style={styles.frame}>
      <Animated.View style={[styles.fold, foldStyle]} onLayout={measure}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flexShrink: 1,
    maxHeight: "55%",
    width: "100%",
  },
  fold: {
    flexShrink: 1,
  },
});
