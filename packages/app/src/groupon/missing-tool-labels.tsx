// Added for Groupon Desk (fork of Paseo, Apache-2.0): the small amber "gh missing" labels of a Mac.

/**
 * The one look of the label that says a Mac's hand cannot find a tool ("gh missing"), wherever the
 * window lists Macs: Connected computers and New workspace's Mac picker. Amber (the theme's
 * warning colour), small, one label per tool; no tool renders nothing. The tools are the model's
 * (`missing-tools-model.ts`).
 */

import { Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { missingToolLabel } from "./missing-tools-model";
import type { MissingTool } from "./strings";

export function MissingToolLabels({
  tools,
  testID,
}: {
  tools: readonly MissingTool[];
  testID?: string;
}) {
  return tools.map((tool) => (
    <Text
      key={tool}
      style={styles.label}
      numberOfLines={1}
      testID={testID ? `${testID}-${tool}` : undefined}
    >
      {missingToolLabel(tool)}
    </Text>
  ));
}

const styles = StyleSheet.create((theme) => ({
  label: {
    flexShrink: 0,
    color: theme.colors.statusWarning,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
}));
