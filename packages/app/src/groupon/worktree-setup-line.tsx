// Added for Groupon Desk (fork of Paseo, Apache-2.0): the worktree's setup (pnpm install, checkout:prepare) as one line above the agent's composer.
import { memo, type ReactElement } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { composerPillStyles } from "@/composer/pill-styles";
import { useWorkspaceSetupStore } from "@/stores/workspace-setup-store";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import { useTickingNow } from "./use-ticking-now";
import {
  READY_VISIBLE_MS,
  type WorktreeSetupLine,
  worktreeSetupLine,
} from "./worktree-setup-line-model";

/**
 * The line for this workspace's setup now, from the setup snapshots the daemon sends
 * (`workspace_setup_progress`, kept in Paseo's setup store); null when there is nothing to say.
 */
export function useWorktreeSetupLine(
  serverId: string,
  workspaceId: string | null | undefined,
): WorktreeSetupLine | null {
  const key = workspaceId ? buildWorkspaceTabPersistenceKey({ serverId, workspaceId }) : null;
  const snapshot = useWorkspaceSetupStore((state) => (key ? (state.snapshots[key] ?? null) : null));
  const counting =
    snapshot !== null &&
    (snapshot.status === "running" ||
      (snapshot.status === "completed" && Date.now() - snapshot.updatedAt <= READY_VISIBLE_MS));
  const now = useTickingNow(counting);
  return worktreeSetupLine(snapshot, counting ? now : Date.now());
}

export const WorktreeSetupRow = memo(function WorktreeSetupRow({
  line,
}: {
  line: WorktreeSetupLine | null;
}): ReactElement | null {
  if (!line) return null;
  return (
    <View
      style={composerPillStyles.body}
      testID="groupon-worktree-setup"
      accessibilityLiveRegion="polite"
    >
      <Text
        style={[composerPillStyles.label, line.tone === "failed" ? styles.failed : null]}
        numberOfLines={1}
      >
        {line.text}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  failed: { color: theme.colors.destructive },
}));
