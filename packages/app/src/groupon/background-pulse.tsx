// Added for Groupon Desk (fork of Paseo, Apache-2.0): the sidebar's mark for a workspace whose agent runs a background task; a phone shows it still.
import type { ReactElement } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/** The web build breathes (`background-pulse.web.tsx`); a phone shows the same dot without motion. */
export function BackgroundPulse(): ReactElement {
  return <View style={styles.dot} testID="background-pulse" />;
}

const styles = StyleSheet.create((theme) => ({
  dot: {
    width: 7,
    height: 7,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.statusDotBackground,
  },
}));
