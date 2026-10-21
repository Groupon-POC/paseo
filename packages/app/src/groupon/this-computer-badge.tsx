// Added for Groupon Desk (fork of Paseo, Apache-2.0): the green "This computer" label after a Mac's name.

/**
 * The one look of the label that marks the computer the window runs on, wherever the window lists
 * Macs. It is a Text, so it sits inline after a name inside a Text or beside it in a row, and it is
 * green (the theme's success colour) so it never blends in with the grey caption under the name.
 * The text is the model's `badge` (`thisComputerBadge`); a null badge renders nothing.
 */

import { Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function ThisComputerBadge({ badge, testID }: { badge: string | null; testID?: string }) {
  if (!badge) return null;
  return (
    <Text style={styles.badge} numberOfLines={1} testID={testID}>
      {badge}
    </Text>
  );
}

const styles = StyleSheet.create((theme) => ({
  badge: {
    color: theme.colors.success,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    flexShrink: 0,
  },
}));
