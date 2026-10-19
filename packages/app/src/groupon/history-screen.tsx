// Added for Groupon Desk (fork of Paseo, Apache-2.0): History, the hub's workspaces and chats, and what colleagues shared.
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { PressHighlight } from "@/components/ui/press-highlight";
import { useRouter, type Href } from "expo-router";
import { StyleSheet } from "react-native-unistyles";
import { BackHeader } from "@/components/headers/back-header";
import { Button } from "@/components/ui/button";
import { fetchOverview, type HubOverview } from "./hub";
import {
  historyTree,
  type HistoryChat,
  type HistoryRepository,
  type HistoryWorkspace,
} from "./history";
import { hubShareRoute } from "./share-menu-item";
import { sharedTree, sharesOfWorkspace, type SharedWorkspaceEntry } from "./share-model";
import { GROUPON_HISTORY, GROUPON_SHARE } from "./strings";

export const HUB_HISTORY_ROUTE = "/hub-history" as Href;

export function historyChatRoute(chat: HistoryChat, workspace: HistoryWorkspace): Href {
  const query = new URLSearchParams({
    title: chat.title,
    context: `${workspace.workspace.name} · ${workspace.machineLabel}`,
  });
  return `/hub-history/${encodeURIComponent(chat.chat.id)}?${query.toString()}` as Href;
}

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "";
}

function ChatRow({ chat, workspace }: { chat: HistoryChat; workspace: HistoryWorkspace }) {
  const router = useRouter();
  const handlePress = useCallback(
    () => router.push(historyChatRoute(chat, workspace)),
    [router, chat, workspace],
  );
  return (
    <PressHighlight
      style={styles.chatRow}
      onPress={handlePress}
      testID={`hub-history-chat-${chat.chat.id}`}
    >
      <Text style={styles.chatTitle} numberOfLines={1}>
        {chat.title}
      </Text>
      <Text style={styles.muted} numberOfLines={1}>
        {[
          chat.chat.status,
          chat.chat.model,
          when(chat.chat.lastMessageAt ?? chat.chat.createdAt),
        ].join(" · ")}
      </Text>
    </PressHighlight>
  );
}

function WorkspaceCard({ entry, sharedWith }: { entry: HistoryWorkspace; sharedWith: number }) {
  const router = useRouter();
  const { workspace } = entry;
  const facts = [entry.machineLabel, workspace.branch ?? workspace.targetBranch, workspace.state];
  if (workspace.diffAdded !== null)
    facts.push(`+${workspace.diffAdded} −${workspace.diffRemoved ?? 0}`);
  if (sharedWith > 0) facts.push(GROUPON_SHARE.sharedWith(sharedWith));
  const openShare = useCallback(
    () => router.push(hubShareRoute({ workspaceId: workspace.id })),
    [router, workspace.id],
  );
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.workspaceName}>
          {workspace.ticketKey ? `${workspace.ticketKey} · ` : ""}
          {workspace.name}
        </Text>
        {workspace.state === "archived" ? null : (
          <Button
            variant="ghost"
            size="sm"
            onPress={openShare}
            testID={`hub-history-share-${workspace.id}`}
          >
            {GROUPON_SHARE.menu}
          </Button>
        )}
      </View>
      <Text style={styles.muted}>{facts.join(" · ")}</Text>
      {entry.chats.length === 0 ? (
        <Text style={styles.muted}>{GROUPON_HISTORY.noChats}</Text>
      ) : null}
      {entry.chats.map((chat) => (
        <ChatRow key={chat.chat.id} chat={chat} workspace={entry} />
      ))}
    </View>
  );
}

/** One workspace a colleague shared: its owner, the role, and its chats in the History reader. */
function SharedCard({ entry }: { entry: SharedWorkspaceEntry }) {
  const facts = [GROUPON_SHARE.by(entry.ownerName), entry.repositoryName];
  facts.push(entry.role === "write" ? GROUPON_SHARE.canWrite : GROUPON_SHARE.canRead);
  if (!entry.keyHandedOver) facts.push(GROUPON_SHARE.waitingForKey);
  return (
    <View style={styles.card} testID={`hub-history-shared-${entry.workspaceId}`}>
      <Text style={styles.workspaceName}>{entry.name}</Text>
      <Text style={styles.muted}>{facts.join(" · ")}</Text>
      {entry.chats.map((chat) => (
        <SharedChatRow
          key={chat.chatId}
          entry={entry}
          chatId={chat.chatId}
          title={chat.title}
          status={chat.status}
        />
      ))}
    </View>
  );
}

function SharedChatRow({
  entry,
  chatId,
  title,
  status,
}: {
  entry: SharedWorkspaceEntry;
  chatId: string;
  title: string;
  status: string;
}) {
  const router = useRouter();
  const open = useCallback(
    () => router.push(sharedChatRoute(entry, chatId, title)),
    [chatId, entry, router, title],
  );
  return (
    <PressHighlight
      style={styles.chatRow}
      onPress={open}
      testID={`hub-history-shared-chat-${chatId}`}
    >
      <Text style={styles.chatTitle} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.muted} numberOfLines={1}>
        {status}
      </Text>
    </PressHighlight>
  );
}

/** A shared chat in the History reader: the reader finds it shared and opens it with the share key. */
export function sharedChatRoute(entry: SharedWorkspaceEntry, chatId: string, title: string): Href {
  const query = new URLSearchParams({
    title,
    context: `${entry.name} · ${GROUPON_SHARE.by(entry.ownerName)}`,
  });
  return `/hub-history/${encodeURIComponent(chatId)}?${query.toString()}` as Href;
}

export function HubHistoryScreen() {
  const [tree, setTree] = useState<HistoryRepository[] | null>(null);
  const [overview, setOverview] = useState<HubOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const read = await fetchOverview();
      setOverview(read);
      setTree(historyTree(read));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);
  const handleRetry = useCallback(() => void load(), [load]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.root} testID="hub-history">
      <BackHeader title={GROUPON_HISTORY.title} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>{GROUPON_HISTORY.intro}</Text>
        {tree === null && !error ? <ActivityIndicator /> : null}
        {error ? (
          <View style={styles.card}>
            <Text style={styles.error}>{error}</Text>
            <Button variant="outline" size="sm" onPress={handleRetry}>
              {GROUPON_HISTORY.retry}
            </Button>
          </View>
        ) : null}
        {overview && sharedTree(overview).length > 0 ? (
          <View style={styles.repository} testID="hub-history-shared-with-me">
            <Text style={styles.repositoryName}>{GROUPON_SHARE.sharedWithMe}</Text>
            {sharedTree(overview).map((entry) => (
              <SharedCard key={entry.shareId} entry={entry} />
            ))}
          </View>
        ) : null}
        {tree?.length === 0 ? <Text style={styles.muted}>{GROUPON_HISTORY.empty}</Text> : null}
        {tree?.map((repository) => (
          <View key={repository.id} style={styles.repository}>
            <Text style={styles.repositoryName}>{repository.name}</Text>
            {repository.workspaces.map((entry) => (
              <WorkspaceCard
                key={entry.workspace.id}
                entry={entry}
                sharedWith={overview ? sharesOfWorkspace(overview, entry.workspace.id).length : 0}
              />
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.surface0 },
  scroll: {
    padding: theme.spacing[4],
    gap: theme.spacing[4],
    width: "100%",
    maxWidth: 820,
    alignSelf: "center",
  },
  intro: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  repository: { gap: theme.spacing[2] },
  repositoryName: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
  },
  card: {
    gap: theme.spacing[1],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  workspaceName: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  chatRow: {
    marginTop: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface2,
    gap: theme.spacing[0.5],
  },
  chatTitle: { color: theme.colors.foreground, fontSize: theme.fontSize.base },
  muted: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  error: { color: theme.colors.destructive, fontSize: theme.fontSize.sm },
}));
