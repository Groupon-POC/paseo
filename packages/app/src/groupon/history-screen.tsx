// Added for Groupon Desk (fork of Paseo, Apache-2.0): History, the hub's workspaces and chats.
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { PressHighlight } from "@/components/ui/press-highlight";
import { useRouter, type Href } from "expo-router";
import { StyleSheet } from "react-native-unistyles";
import { BackHeader } from "@/components/headers/back-header";
import { Button } from "@/components/ui/button";
import { fetchOverview } from "./hub";
import {
  historyTree,
  type HistoryChat,
  type HistoryRepository,
  type HistoryWorkspace,
} from "./history";
import { GROUPON_HISTORY } from "./strings";

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

function WorkspaceCard({ entry }: { entry: HistoryWorkspace }) {
  const { workspace } = entry;
  const facts = [entry.machineLabel, workspace.branch ?? workspace.targetBranch, workspace.state];
  if (workspace.diffAdded !== null)
    facts.push(`+${workspace.diffAdded} −${workspace.diffRemoved ?? 0}`);
  return (
    <View style={styles.card}>
      <Text style={styles.workspaceName}>
        {workspace.ticketKey ? `${workspace.ticketKey} · ` : ""}
        {workspace.name}
      </Text>
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

export function HubHistoryScreen() {
  const [tree, setTree] = useState<HistoryRepository[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setTree(historyTree(await fetchOverview()));
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
        {tree?.length === 0 ? <Text style={styles.muted}>{GROUPON_HISTORY.empty}</Text> : null}
        {tree?.map((repository) => (
          <View key={repository.id} style={styles.repository}>
            <Text style={styles.repositoryName}>{repository.name}</Text>
            {repository.workspaces.map((entry) => (
              <WorkspaceCard key={entry.workspace.id} entry={entry} />
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
