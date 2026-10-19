// Added for Groupon Desk (fork of Paseo, Apache-2.0): "Shared with me" in the sidebar.
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { StyleSheet } from "react-native-unistyles";
import { PressHighlight } from "@/components/ui/press-highlight";
import { fetchOverview } from "./hub";
import { sharedChatRoute } from "./history-screen";
import { useGrouponStore } from "./session";
import { sharedTree, type SharedWorkspaceEntry } from "./share-model";
import { GROUPON_SHARE } from "./strings";

/** How often the sidebar asks the hub again: a share lands without a frame on a device with no hand. */
const REFRESH_MS = 60_000;

/** The workspaces colleagues shared with the person; nothing at all while there are none. */
export function SharedWithMeSidebarSection({
  onBeforeNavigate,
}: {
  onBeforeNavigate?: () => void;
}) {
  const ready = useGrouponStore((state) => state.status === "ready");
  const [entries, setEntries] = useState<SharedWorkspaceEntry[]>([]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const read = async () => {
      try {
        const overview = await fetchOverview();
        if (!cancelled) setEntries(sharedTree(overview));
      } catch {
        // The hub is out of reach for now; the next read tries again and the list stays as it was.
      }
    };
    void read();
    const timer = setInterval(() => void read(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [ready]);

  if (!ready || entries.length === 0) return null;
  return (
    <View style={styles.section} testID="sidebar-shared-with-me">
      <Text style={styles.heading}>{GROUPON_SHARE.sharedWithMe}</Text>
      {entries.map((entry) => (
        <SharedRow key={entry.shareId} entry={entry} onBeforeNavigate={onBeforeNavigate} />
      ))}
    </View>
  );
}

function SharedRow({
  entry,
  onBeforeNavigate,
}: {
  entry: SharedWorkspaceEntry;
  onBeforeNavigate?: () => void;
}) {
  const router = useRouter();
  const first = entry.chats[0];
  const open = useCallback(() => {
    if (!first) return;
    onBeforeNavigate?.();
    router.push(sharedChatRoute(entry, first.chatId, first.title));
  }, [entry, first, onBeforeNavigate, router]);
  return (
    <PressHighlight
      style={styles.row}
      onPress={open}
      testID={`sidebar-shared-${entry.workspaceId}`}
    >
      <Text style={styles.name} numberOfLines={1}>
        {entry.name}
      </Text>
      <Text style={styles.muted} numberOfLines={1}>
        {GROUPON_SHARE.by(entry.ownerName)}
      </Text>
    </PressHighlight>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    gap: theme.spacing[0.5],
    paddingHorizontal: theme.spacing[2],
    paddingBottom: theme.spacing[2],
  },
  heading: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    paddingHorizontal: theme.spacing[2],
    paddingTop: theme.spacing[2],
  },
  row: {
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  name: { color: theme.colors.foreground, fontSize: theme.fontSize.sm },
  muted: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
}));
