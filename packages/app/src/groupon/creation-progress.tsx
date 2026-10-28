// Added for Groupon Desk (fork of Paseo, Apache-2.0): New workspace says which step it waits on and for how long, under the composer.
import { useCallback, useState, type ReactElement } from "react";
import { Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { CreationSnapshot } from "@getpaseo/protocol/messages";
import {
  type CreationProgress,
  creationCaption,
  progressWithStep,
  startedProgress,
} from "./creation-progress-model";
import { useTickingNow } from "./use-ticking-now";

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

/** The caption, while `pending` and a creation was started; nothing otherwise. */
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
  return (
    <Text
      style={styles.caption}
      numberOfLines={1}
      accessibilityLiveRegion="polite"
      testID="groupon-creation-progress"
    >
      {creationCaption(progress, now)}
    </Text>
  );
}

const styles = StyleSheet.create((theme) => ({
  caption: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
}));
