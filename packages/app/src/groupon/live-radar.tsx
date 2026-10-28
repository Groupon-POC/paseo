// Added for Groupon Desk (fork of Paseo, Apache-2.0): the background tasks pill's breathing radar on a phone, where TARS's blob does not draw.

import { useEffect, type ReactElement } from "react";
import { Radar } from "lucide-react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";

const ThemedRadar = withUnistyles(Radar);
const liveColor = (theme: Theme) => ({ color: theme.colors.accent });

/** The radar breathes while a watch runs: a slow pulse of its size and strength. */
export function LiveRadar(): ReactElement {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.45 + pulse.value * 0.55,
    transform: [{ scale: 0.88 + pulse.value * 0.2 }],
  }));
  return (
    <Animated.View style={style} testID="groupon-agent-monitors-live">
      <ThemedRadar size={14} uniProps={liveColor} />
    </Animated.View>
  );
}
