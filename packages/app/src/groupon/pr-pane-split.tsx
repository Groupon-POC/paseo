// Added for Groupon Desk (fork of Paseo, Apache-2.0): the pull request pane's checks and activity as two blocks, each scrolling on its own; a folded activity sits at the pane's foot, and a handle between them sets the checks' height, kept on the device.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useState, type ReactElement, type ReactNode } from "react";
import { ScrollView, View, type LayoutChangeEvent } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { z } from "zod";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ResizeHandle } from "@/components/resize-handle";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";
import { clampChecksShare, type PrPaneBlock, prPaneSplitLayout } from "./pr-pane-split-model";

const usePrPaneSplitStore = create<{
  checksShare: number | null;
  setChecksShare: (share: number) => void;
}>()(
  persist(
    (set) => ({
      checksShare: null,
      setChecksShare: (share) => set({ checksShare: clampChecksShare(share) }),
    }),
    {
      name: "groupon-desk-pr-pane-split",
      storage: createValidatedPersistStorage(
        AsyncStorage,
        z.object({ checksShare: z.number().min(0).max(1).nullable() }),
      ),
      partialize: (state) => ({ checksShare: state.checksShare }),
    },
  ),
);

const SPLIT_GROUP = "groupon-pr-pane";

/** Its two children are the checks block and the activity block, in that order. */
export function PrPaneSplit({
  children: [checks, activity],
  checksOpen,
  activityOpen,
}: {
  children: [ReactNode, ReactNode];
  checksOpen: boolean;
  activityOpen: boolean;
}): ReactElement {
  const storedShare = usePrPaneSplitStore((state) => state.checksShare);
  const setChecksShare = usePrPaneSplitStore((state) => state.setChecksShare);
  const [previewShare, setPreviewShare] = useState<number | null>(null);
  const [paneHeight, setPaneHeight] = useState(0);
  const [checksHeight, setChecksHeight] = useState(0);
  const layout = prPaneSplitLayout({
    checksOpen,
    activityOpen,
    checksShare: previewShare ?? storedShare,
    paneHeight,
  });
  const share = previewShare ?? storedShare ?? (paneHeight > 0 ? checksHeight / paneHeight : 0.5);

  const onPaneLayout = useCallback(
    (event: LayoutChangeEvent) => setPaneHeight(event.nativeEvent.layout.height),
    [],
  );
  const onChecksLayout = useCallback(
    (event: LayoutChangeEvent) => setChecksHeight(event.nativeEvent.layout.height),
    [],
  );
  const preview = useCallback(
    (_group: string, sizes: number[]) => setPreviewShare(sizes[0] ?? null),
    [],
  );
  const commit = useCallback(
    (_group: string, sizes: number[]) => {
      setPreviewShare(null);
      if (sizes[0] !== undefined) setChecksShare(sizes[0]);
    },
    [setChecksShare],
  );

  return (
    <View style={styles.pane} onLayout={onPaneLayout} testID="pr-pane-split">
      <View style={blockStyle(layout.checks)} onLayout={onChecksLayout}>
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {checks}
        </ScrollView>
      </View>
      {layout.handle ? (
        <ResizeHandle
          testID="pr-pane-split-handle"
          direction="vertical"
          groupId={SPLIT_GROUP}
          index={0}
          sizes={[share, 1 - share]}
          containerSize={paneHeight}
          onPreviewResizeSplit={preview}
          onResizeSplit={commit}
        />
      ) : (
        <View style={styles.divider} />
      )}
      <View style={blockStyle(layout.activity)} testID="pr-pane-activity-block">
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {activity}
        </ScrollView>
      </View>
    </View>
  );
}

function blockStyle(block: PrPaneBlock) {
  switch (block.kind) {
    case "height":
      return [styles.fixed, { height: block.height }];
    case "content":
      return styles.content;
    case "fill":
      return styles.fill;
    case "foot":
      return styles.foot;
    case "header":
      return styles.fixed;
  }
}

const styles = StyleSheet.create((theme) => ({
  pane: {
    flex: 1,
    minHeight: 0,
  },
  scroll: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  fixed: {
    flexShrink: 0,
  },
  content: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
    maxHeight: "50%",
  },
  fill: {
    flex: 1,
    minHeight: 0,
  },
  foot: {
    flexShrink: 0,
    marginTop: "auto",
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
}));
