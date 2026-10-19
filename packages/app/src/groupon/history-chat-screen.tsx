// Added for Groupon Desk (fork of Paseo, Apache-2.0): one chat's saved transcript, opened on the device.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { PressHighlight } from "@/components/ui/press-highlight";
import { StyleSheet } from "react-native-unistyles";
import { BackHeader } from "@/components/headers/back-header";
import { MarkdownRenderer } from "@/components/markdown/renderer";
import { Button } from "@/components/ui/button";
import { fetchAllMessages } from "./hub";
import {
  inputSummary,
  openMessages,
  turnResultLine,
  type MessageBlock,
  type MessageBody,
  type OpenedMessage,
} from "./history";
import { useGrouponStore } from "./session";
import { GROUPON_HISTORY } from "./strings";

function pretty(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const EXPANDED = { expanded: true };
const COLLAPSED = { expanded: false };

/** A row that shows its title and opens to its body on a tap: thinking, tool input, tool result. */
function Fold({ title, tone, children }: { title: string; tone?: "error"; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((value) => !value), []);
  return (
    <View style={styles.fold}>
      <PressHighlight
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={open ? EXPANDED : COLLAPSED}
      >
        <Text
          style={tone === "error" ? styles.foldTitleError : styles.foldTitle}
          numberOfLines={open ? undefined : 1}
        >
          {open ? "▾ " : "▸ "}
          {title}
        </Text>
      </PressHighlight>
      {open ? <View style={styles.foldBody}>{children}</View> : null}
    </View>
  );
}

function Code({ text }: { text: string }) {
  return (
    <Text style={styles.code} selectable>
      {text}
    </Text>
  );
}

function Block({ block }: { block: MessageBlock }) {
  switch (block.type) {
    case "text":
      return <MarkdownRenderer text={block.text} />;
    case "thinking":
      return (
        <Fold title={GROUPON_HISTORY.thinking}>
          <Text style={styles.muted} selectable>
            {block.text}
          </Text>
        </Fold>
      );
    case "tool_use":
      return (
        <Fold title={`${block.name} ${inputSummary(block.input)}`}>
          <Code text={pretty(block.input)} />
        </Fold>
      );
    default:
      return null;
  }
}

function Body({ body }: { body: MessageBody }) {
  switch (body.kind) {
    case "message":
      if (body.role === "user") {
        return (
          <View style={styles.userBubble}>
            <Text style={styles.userText} selectable>
              {body.text}
            </Text>
          </View>
        );
      }
      return (
        <View style={styles.assistant}>
          {body.blocks.map((block, index) => (
            // Blocks have no id of their own; their order inside one sealed message is fixed.
            // oxlint-disable-next-line react/no-array-index-key
            <Block key={index} block={block} />
          ))}
        </View>
      );
    case "tool_result":
      return (
        <Fold
          title={body.isError ? GROUPON_HISTORY.resultError : GROUPON_HISTORY.result}
          tone={body.isError ? "error" : undefined}
        >
          <Code text={body.content} />
        </Fold>
      );
    case "permission_request":
      return (
        <View style={styles.permission}>
          <Text style={styles.permissionTitle}>{GROUPON_HISTORY.asked(body.toolName)}</Text>
          <Text style={styles.muted}>{inputSummary(body.input, 160)}</Text>
          {body.reason ? <Text style={styles.muted}>{body.reason}</Text> : null}
        </View>
      );
    case "permission_answer": {
      let verdict: string = GROUPON_HISTORY.withdrawn;
      if (body.behavior === "allow")
        verdict = body.always ? GROUPON_HISTORY.allowedAlways : GROUPON_HISTORY.allowed;
      if (body.behavior === "deny") verdict = GROUPON_HISTORY.denied;
      return (
        <Text style={styles.answer}>
          {verdict}
          {body.message ? `: ${body.message}` : ""}
        </Text>
      );
    }
    case "turn_result":
      return (
        <View style={styles.turnResult}>
          <Text style={body.failed ? styles.errorText : styles.muted}>
            ✻ {turnResultLine(body)}
          </Text>
          {body.error ? <Text style={styles.errorText}>{body.error}</Text> : null}
          {body.denials.map((denial) => (
            <Text key={denial} style={styles.muted}>
              {GROUPON_HISTORY.notAllowed(denial)}
            </Text>
          ))}
        </View>
      );
    case "notice":
      return <Text style={styles.notice}>{body.text}</Text>;
    default:
      return null;
  }
}

function Message({ message }: { message: OpenedMessage }) {
  if (message.body === null) {
    return <Text style={styles.notice}>{GROUPON_HISTORY.sealedElsewhere}</Text>;
  }
  return <Body body={message.body} />;
}

export function HubHistoryChatScreen({
  chatId,
  title,
  context,
}: {
  chatId: string;
  title?: string;
  context?: string;
}) {
  const sealKey = useGrouponStore((state) => state.sealKey);
  const [messages, setMessages] = useState<OpenedMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sealKey) return;
    setError(null);
    try {
      setMessages(openMessages(await fetchAllMessages(chatId), sealKey));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [chatId, sealKey]);
  const handleRetry = useCallback(() => void load(), [load]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.root} testID="hub-history-chat">
      <BackHeader title={title ?? GROUPON_HISTORY.title} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {context ? <Text style={styles.muted}>{context}</Text> : null}
        {messages ? (
          <Text style={styles.muted}>{GROUPON_HISTORY.messages(messages.length)}</Text>
        ) : null}
        {messages === null && !error ? <ActivityIndicator /> : null}
        {error ? (
          <View style={styles.permission}>
            <Text style={styles.errorText}>{error}</Text>
            <Button variant="outline" size="sm" onPress={handleRetry}>
              {GROUPON_HISTORY.retry}
            </Button>
          </View>
        ) : null}
        {messages?.map((message) => (
          <Message key={message.row.id} message={message} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.surface0 },
  scroll: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
    width: "100%",
    maxWidth: 820,
    alignSelf: "center",
  },
  muted: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  errorText: { color: theme.colors.destructive, fontSize: theme.fontSize.sm },
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "85%",
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius["2xl"],
    backgroundColor: theme.colors.surface3,
  },
  userText: { color: theme.colors.foreground, fontSize: theme.fontSize.content },
  assistant: { gap: theme.spacing[2] },
  fold: {
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface1,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  foldTitle: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  foldTitleError: { color: theme.colors.destructive, fontSize: theme.fontSize.sm },
  foldBody: { paddingTop: theme.spacing[2] },
  code: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.code,
    fontFamily: theme.fontFamily.mono,
  },
  permission: {
    gap: theme.spacing[1],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    backgroundColor: theme.colors.surface1,
  },
  permissionTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  answer: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm, fontStyle: "italic" },
  turnResult: { gap: theme.spacing[0.5] },
  notice: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm, textAlign: "center" },
}));
