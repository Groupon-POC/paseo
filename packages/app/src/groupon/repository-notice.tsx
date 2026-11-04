// Added for Groupon Desk (fork of Paseo, Apache-2.0): repository availability and manual checkout selection on the chosen Mac.
/** Shows why a repository is unavailable and the actions to use an existing checkout or clone it. */
import type { ReactElement } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import type { RepositoryChoice } from "./repository-picker";
import { cloneTargetOf, shortPath } from "./repository-picker-model";
import { GROUPON_REPOSITORY_PICKER } from "./strings";

/** The one line under the fields when the chosen Mac lacks the repository, or is opening it. */
export function RepositoryNotice({
  choice,
}: {
  choice: Pick<RepositoryChoice, "entry" | "state" | "clone" | "pickExisting" | "macLabel">;
}): ReactElement | null {
  const { entry, state, clone, pickExisting, macLabel } = choice;
  if (!entry || state.kind === "none" || state.kind === "ready") return null;
  let text: string;
  if (state.kind === "opening") {
    text = GROUPON_REPOSITORY_PICKER.adding(shortPath(state.checkout.path), macLabel);
  } else if (state.kind === "openFailed") {
    text = GROUPON_REPOSITORY_PICKER.addFailed(
      shortPath(state.checkout.path),
      macLabel,
      state.reason,
    );
  } else if (entry.remote === null) {
    text = GROUPON_REPOSITORY_PICKER.folderNotOn(entry.label, macLabel);
  } else {
    text = GROUPON_REPOSITORY_PICKER.notOn(entry.label, macLabel);
  }
  return (
    <View style={styles.notice} testID="new-workspace-repository-notice">
      <Text style={styles.noticeText}>{text}</Text>
      {state.kind === "missing" && state.cloneable ? (
        <Button variant="outline" size="sm" onPress={clone} testID="new-workspace-repository-clone">
          {GROUPON_REPOSITORY_PICKER.cloneOn(macLabel)}
        </Button>
      ) : null}
      {cloneTargetOf(entry) && (state.kind === "missing" || state.kind === "openFailed") ? (
        <Button
          variant="ghost"
          size="sm"
          onPress={pickExisting}
          testID="new-workspace-repository-existing"
        >
          {GROUPON_REPOSITORY_PICKER.chooseExisting(macLabel)}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  notice: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    marginBottom: theme.spacing[3],
  },
  noticeText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    flexShrink: 1,
  },
}));
