// Changed for Groupon Desk (fork of Paseo, Apache-2.0): the counts roll to their new values as the diff changes (groupon/rolling-count).
import { View, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { formatDiffCount } from "@/git/file-header-presentation";
import { RollingCount } from "@/groupon/rolling-count";

interface DiffStatProps {
  additions: number;
  deletions: number;
  testID?: string;
}

export function DiffStat({ additions, deletions, testID }: DiffStatProps) {
  return (
    <View style={styles.row} testID={testID}>
      <Text style={styles.additions}>
        +<RollingCount text={formatDiffCount(additions)} />
      </Text>
      <Text style={styles.deletions}>
        -<RollingCount text={formatDiffCount(deletions)} />
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: 20,
    gap: 4,
    flexShrink: 0,
  },
  additions: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.statusSuccess,
  },
  deletions: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.statusDanger,
  },
}));
