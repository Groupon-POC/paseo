// Added for Groupon Desk (fork of Paseo, Apache-2.0): the author of a user message in the chat: whose it is, the colleague's tint and name chip, the legend.
import type { UserMessageAuthor } from "@getpaseo/protocol/agent-types";
import { memo } from "react";
import { Platform, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { getIsElectronRuntime } from "@/constants/layout";
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

/** The small name chip above a colleague's bubble: "Tomas Zaruba · Mac app". */
export const AuthorChip = memo(function AuthorChip({
  look,
}: {
  look: Extract<MessageLook, { kind: "colleague" }>;
}) {
  return (
    <View
      style={authorStyles.chip}
      accessibilityLabel={look.accessibilityLabel}
      testID="message-author-chip"
    >
      <Text style={authorStyles.chipText} numberOfLines={1}>
        {look.chip}
      </Text>
    </View>
  );
});

/** One line on the Share screen: what the three looks mean. */
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
        <View style={[authorStyles.swatch, authorStyles.swatchAgent]} />
        <Text style={authorStyles.legendText}>{GROUPON_AUTHOR.agent}</Text>
      </View>
    </View>
  );
}

/**
 * The colleague's look, laid over a user message's own styles: on the left like another person
 * in a chat app, in the theme's `colleagueMessage` tint (the accent, thinned in `styles/theme.ts`).
 * The person's own bubble keeps Paseo's `surface3`.
 */
export const authorStyles = StyleSheet.create((theme) => ({
  colleagueContainer: { justifyContent: "flex-start" },
  colleagueContent: { alignItems: "flex-start" },
  colleagueBubble: {
    backgroundColor: theme.colors.colleagueMessage,
    borderWidth: 1,
    borderColor: theme.colors.colleagueMessageBorder,
  },
  colleagueBubbleCorner: {
    borderTopRightRadius: theme.borderRadius["2xl"],
    borderTopLeftRadius: theme.borderRadius.sm,
  },
  colleagueTrailing: { alignSelf: "flex-start" },
  chip: {
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
