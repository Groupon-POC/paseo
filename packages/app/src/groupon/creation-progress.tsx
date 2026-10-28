// Added for Groupon Desk (fork of Paseo, Apache-2.0): New workspace shows TARS's blob while a workspace is made, with the time and the step it waits on, under the composer.
import { useCallback, useState, type ReactElement } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { CreationSnapshot } from "@getpaseo/protocol/messages";
import {
  type CreationProgress,
  creationCaption,
  creationStatus,
  progressWithStep,
  startedProgress,
} from "./creation-progress-model";
import { useTickingNow } from "./use-ticking-now";
import { WhimsyLoader } from "./whimsy-loader";

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

/**
 * While `pending` and a creation was started: the time leading, TARS's blob with its typed word,
 * and the daemon's step once there is one; nothing otherwise.
 */
export function CreationProgressCaption({
  progress,
  pending,
}: {
  progress: CreationProgress | null;
  pending: boolean;
}): ReactElement | null {
  const visible = pending && progress !== null;
  const now = useTickingNow(visible);
  if (!visible) return null;
  const status = creationStatus(progress, now);
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={creationCaption(progress, now)}
      accessibilityLiveRegion="polite"
      testID="groupon-creation-progress"
    >
      <Text style={styles.elapsed}>{status.elapsed}</Text>
      <WhimsyLoader fallback={FALLBACK} />
      {status.step ? (
        <Text style={styles.step} numberOfLines={1}>
          {status.step}
        </Text>
      ) : null}
    </View>
  );
}

const FALLBACK = <ActivityIndicator size="small" />;

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
  elapsed: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  step: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    flexShrink: 1,
    minWidth: 0,
  },
}));
