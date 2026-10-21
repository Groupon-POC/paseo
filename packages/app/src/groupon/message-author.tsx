// Added for Groupon Desk (fork of Paseo, Apache-2.0): the author of a user message in the chat: whose it is, the colleague's and another agent's tint and name chip, the legend.
import type { UserMessageAuthor } from "@getpaseo/protocol/agent-types";
import { Bot } from "lucide-react-native";
import { memo } from "react";
import { Platform, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { getIsElectronRuntime } from "@/constants/layout";
import type { Theme } from "@/styles/theme";
import { authorOfViewer, messageLook, type MessageLook } from "./message-author-model";
import { deviceName } from "./presence-model";
import { useGrouponStore } from "./session";
import { GROUPON_AUTHOR } from "./strings";

/** The device this window runs on, as a message's author names it. */
export function thisDevice(): string {
  return deviceName(Platform.OS, getIsElectronRuntime());
}

/** The author of a prompt this window sends now: the signed-in person; undefined when signed out. */
export function signedInMessageAuthor(): UserMessageAuthor | undefined {
  return authorOfViewer(useGrouponStore.getState().identity, thisDevice()) ?? undefined;
}

/**
 * How a user message in a live Paseo chat is drawn. The chat runs on the person's own daemon, so
 * they own its workspace: a message without an author is theirs.
 */
export function useMessageLook(author: UserMessageAuthor | undefined): MessageLook {
  const viewerUserId = useGrouponStore((state) => state.identity?.userId ?? null);
  return messageLook({ author, viewerUserId, viewerOwnsWorkspace: true });
}

const ThemedBot = withUnistyles(Bot, (theme: Theme) => ({ color: theme.colors.foregroundMuted }));

/**
 * The small name chip above a bubble that is not the person's own: "Tomas Zaruba · Mac app", or
 * for another agent a bot icon and "<workspace title> (agent)".
 */
export const AuthorChip = memo(function AuthorChip({
  look,
}: {
  look: Exclude<MessageLook, { kind: "mine" }>;
}) {
  return (
    <View
      style={authorStyles.chip}
      accessibilityLabel={look.accessibilityLabel}
      testID="message-author-chip"
    >
      {look.kind === "agent" ? <ThemedBot size={12} /> : null}
      <Text style={authorStyles.chipText} numberOfLines={1}>
        {look.chip}
      </Text>
    </View>
  );
});

/** One line on the Share screen: what the four looks mean. */
export function AuthorLegend() {
  return (
    <View style={authorStyles.legend} testID="message-author-legend">
      <Text style={authorStyles.legendTitle}>{GROUPON_AUTHOR.legendTitle}</Text>
      <View style={authorStyles.legendItem}>
        <View style={[authorStyles.swatch, authorStyles.swatchMine]} />
        <Text style={authorStyles.legendText}>{GROUPON_AUTHOR.you}</Text>
      </View>
      <View style={authorStyles.legendItem}>
        <View style={[authorStyles.swatch, authorStyles.colleagueBubble]} />
        <Text style={authorStyles.legendText}>{GROUPON_AUTHOR.colleagueLegend}</Text>
      </View>
      <View style={authorStyles.legendItem}>
        <View style={[authorStyles.swatch, authorStyles.agentBubble]} />
        <Text style={authorStyles.legendText}>{GROUPON_AUTHOR.anotherAgentLegend}</Text>
      </View>
      <View style={authorStyles.legendItem}>
        <View style={[authorStyles.swatch, authorStyles.swatchAgent]} />
        <Text style={authorStyles.legendText}>{GROUPON_AUTHOR.agent}</Text>
      </View>
    </View>
  );
}

/**
 * The colleague's and another agent's looks, laid over a user message's own styles: on the left
 * like another person in a chat app, in the theme's `colleagueMessage` tint (the accent, thinned in
 * `styles/theme.ts`) or, for another agent, its `agentMessage` tint (violet). The person's own
 * bubble keeps Paseo's `surface3`.
 */
export const authorStyles = StyleSheet.create((theme) => ({
  colleagueContainer: { justifyContent: "flex-start" },
  colleagueContent: { alignItems: "flex-start" },
  colleagueBubble: {
    backgroundColor: theme.colors.colleagueMessage,
    borderWidth: 1,
    borderColor: theme.colors.colleagueMessageBorder,
  },
  agentBubble: {
    backgroundColor: theme.colors.agentMessage,
    borderWidth: 1,
    borderColor: theme.colors.agentMessageBorder,
  },
  colleagueBubbleCorner: {
    borderTopRightRadius: theme.borderRadius["2xl"],
    borderTopLeftRadius: theme.borderRadius.sm,
  },
  colleagueTrailing: { alignSelf: "flex-start" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    alignSelf: "flex-start",
    maxWidth: "100%",
    marginBottom: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[0.5],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface2,
  },
  chipText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  legend: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: theme.spacing[3] },
  legendTitle: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  legendItem: { flexDirection: "row", alignItems: "center", gap: theme.spacing[1] },
  legendText: { color: theme.colors.foreground, fontSize: theme.fontSize.sm },
  swatch: { width: 14, height: 14, borderRadius: theme.borderRadius.sm },
  swatchMine: { backgroundColor: theme.colors.surface3 },
  swatchAgent: {
    backgroundColor: theme.colors.surface0,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
}));
