// Changed for Groupon Desk (fork of Paseo, Apache-2.0): a background tone, the same ring in the status band's teal for an agent's background task.
import { memo } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import {
  StatusRingFrame,
  type StatusRingProps,
  rotatorStyles,
  styles,
} from "@/components/status-ring/frame";
import { useStatusRingRotation } from "@/components/status-ring/clock";

/**
 * Native running indicator. The rotation is published by one shared UI-thread clock rather than
 * per-instance timing, so a ring that mounts mid-flight is already in phase — see `clock.ts`.
 *
 * The rotated view carries no theme-tracked style; the coloured arc is nested inside it. Putting
 * a Unistyles style on a Reanimated view crashes on theme change (docs/unistyles.md).
 */
export const StatusRing = memo(function StatusRing({ backdrop, tone }: StatusRingProps) {
  const rotation = useStatusRingRotation();
  const rotatorStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <StatusRingFrame backdrop={backdrop} tone={tone}>
      <Animated.View style={[rotatorStyles.rotator, rotatorStyle]}>
        <View style={tone === "background" ? styles.arcBackground : styles.arc} />
      </Animated.View>
    </StatusRingFrame>
  );
});
