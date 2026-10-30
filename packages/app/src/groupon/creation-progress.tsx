// Added for Groupon Desk (fork of Paseo, Apache-2.0): New workspace shows the step a workspace's creation is on as a chat's feed shows a running step, and below it, on a line of its own, the time and TARS's blob as a running turn shows them.
import { Download, FolderGit2, FolderOpen, GitBranch, Wrench } from "lucide-react-native";
import { useCallback, useMemo, useState, type ComponentType, type ReactElement } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { CreationSnapshot } from "@getpaseo/protocol/messages";
import { WorkingIndicator } from "@/agent-stream/turn-footer";
import { ExpandableBadge } from "@/components/message";
import {
  type CreationProgress,
  creationCaption,
  creationStep,
  progressWithStep,
  startedProgress,
} from "./creation-progress-model";
import { useTickingNow } from "./use-ticking-now";

const STEP_ICONS: Record<string, ComponentType<{ size?: number; color?: string }>> = {
  naming_branch: GitBranch,
  fetching_base: Download,
  creating_worktree: FolderGit2,
  registering_workspace: FolderOpen,
};

/** The screen's progress: `start` on Enter, `observe` each creation snapshot, `clear` when done. */
export function useCreationProgress() {
  const [progress, setProgress] = useState<CreationProgress | null>(null);
  const start = useCallback(() => setProgress(startedProgress(Date.now())), []);
  const observe = useCallback((snapshot: CreationSnapshot) => {
    setProgress((current) =>
      current ? progressWithStep(current, snapshot.step?.id, Date.now()) : current,
    );
  }, []);
  const clear = useCallback(() => setProgress(null), []);
  return { progress, start, observe, clear };
}

/** While `pending` and a creation was started: the daemon's step once there is one, then the loader. */
export function CreationProgressCaption({
  progress,
  pending,
}: {
  progress: CreationProgress | null;
  pending: boolean;
}): ReactElement | null {
  const visible = pending && progress !== null;
  const now = useTickingNow(visible);
  const submittedAt = progress?.submittedAt ?? null;
  const startedAt = useMemo(
    () => (submittedAt === null ? null : new Date(submittedAt)),
    [submittedAt],
  );
  if (!visible) return null;
  const step = creationStep(progress);
  return (
    <View
      style={styles.column}
      accessible
      accessibilityLabel={creationCaption(progress, now)}
      accessibilityLiveRegion="polite"
      testID="groupon-creation-progress"
    >
      {step ? (
        <ExpandableBadge
          testID="groupon-creation-step"
          label={step.label}
          secondaryLabel={step.command ?? undefined}
          icon={STEP_ICONS[step.id] ?? Wrench}
          isExpanded={false}
          isLoading
          isLastInSequence
        />
      ) : null}
      <View style={step ? styles.loaderAfterStep : null}>
        <WorkingIndicator inFlightTurnStartedAt={startedAt} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  column: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
  // The gap a chat's feed leaves between its last running step and the turn's loader.
  loaderAfterStep: {
    marginTop: theme.spacing[2] + 5,
  },
}));
