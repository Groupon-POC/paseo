// Added for Groupon Desk (fork of Paseo, Apache-2.0): a sheet's subtitle line in the theme's secondary foreground.

/**
 * Paseo's sheet header (`components/adaptive-modal-sheet.tsx`) renders `subtitle` as it is given:
 * a bare string landed in a View with no text style and read dark grey on the dark sheet ("On
 * <Mac>", "Clones to <Mac>"). Paseo's own sheets pass a Text in `foregroundMuted`
 * (`components/import-session-sheet.tsx`); the Groupon sheets pass this.
 */

import { Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ThisComputerBadge } from "./this-computer-badge";

export function SheetSubtitle({
  text,
  badge,
  testID,
}: {
  text: string;
  /** The green "This computer" after the text, when the sheet names this Mac. */
  badge?: string | null;
  testID?: string;
}) {
  return (
    <Text style={styles.subtitle} numberOfLines={1} testID={testID}>
      {text}
      {badge ? (
        <>
          {" "}
          <ThisComputerBadge badge={badge} />
        </>
      ) : null}
    </Text>
  );
}

const styles = StyleSheet.create((theme) => ({
  subtitle: {
    flexShrink: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
