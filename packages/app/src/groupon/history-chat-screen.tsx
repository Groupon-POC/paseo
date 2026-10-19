// Added for Groupon Desk (fork of Paseo, Apache-2.0): one chat's saved transcript, opened on the device; a chat a colleague shared opens with its share key, with a composer when they may write.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { PressHighlight } from "@/components/ui/press-highlight";
import { StyleSheet } from "react-native-unistyles";
import { BackHeader } from "@/components/headers/back-header";
import { MarkdownRenderer } from "@/components/markdown/renderer";
import { Button } from "@/components/ui/button";
import { EditingTextInput } from "@/components/ui/text-input";
import {
  answerPermission,
  fetchAllMessages,
  fetchOverview,
  sendSharedPrompt,
  type HubSharedWorkspace,
} from "./hub";
import {
  inputSummary,
  openMessages,
  turnResultLine,
  type MessageBlock,
  type MessageBody,
  type OpenedMessage,
} from "./history";
import { useGrouponStore } from "./session";
import {
  openPermissionRequests,
  sealPrompt,
  sharedKeyOf,
  sharedWorkspaceOfChat,
} from "./share-model";
import { GROUPON_HISTORY, GROUPON_SHARE } from "./strings";

/** How often a shared chat is read again while it is open: a colleague has no hand on this device to push it. */
const SHARED_REFRESH_MS = 5_000;

/** A chat a colleague shared: the grant, and the share key's seal key and version. */
interface SharedAccess {
  entry: HubSharedWorkspace;
  sealKey: Uint8Array;
  version: number;
}

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
  const deskIdentity = useGrouponStore((state) => state.deskIdentity);
  const [messages, setMessages] = useState<OpenedMessage[] | null>(null);
  const [shared, setShared] = useState<SharedAccess | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sealKey) return;
    setError(null);
    try {
      const [rows, overview] = await Promise.all([fetchAllMessages(chatId), fetchOverview()]);
      const entry = sharedWorkspaceOfChat(overview, chatId);
      if (entry === null) {
        setShared(null);
        setMessages(openMessages(rows, sealKey));
        return;
      }
      const key = sharedKeyOf(entry, deskIdentity);
      if (!key.ok) {
        setError(key.why);
        return;
      }
      setShared({ entry, sealKey: key.sealKey, version: key.version });
      setMessages(openMessages(rows, key.sealKey));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [chatId, deskIdentity, sealKey]);
  const handleRetry = useCallback(() => void load(), [load]);

  useEffect(() => {
    void load();
  }, [load]);

  const isShared = shared !== null;
  useEffect(() => {
    if (!isShared) return;
    const timer = setInterval(() => void load(), SHARED_REFRESH_MS);
    return () => clearInterval(timer);
  }, [isShared, load]);

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
        {shared && shared.entry.role === "write" && messages ? (
          <SharedWriter chatId={chatId} access={shared} messages={messages} onSent={load} />
        ) : null}
      </ScrollView>
    </View>
  );
}

/** A writer's part of a shared chat: the open permission requests to allow or deny, and the composer. */
function SharedWriter({
  chatId,
  access,
  messages,
  onSent,
}: {
  chatId: string;
  access: SharedAccess;
  messages: OpenedMessage[];
  onSent: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [generation, setGeneration] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requests = openPermissionRequests(messages);

  const run = useCallback(
    async (work: () => Promise<unknown>, done: string) => {
      setBusy(true);
      setError(null);
      try {
        await work();
        setNotice(done);
        await onSent();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(false);
      }
    },
    [onSent],
  );
  const send = useCallback(() => {
    const prompt = text.trim();
    if (prompt.length === 0) return;
    void run(async () => {
      await sendSharedPrompt(chatId, sealPrompt(prompt, chatId, access.sealKey), access.version);
      setText("");
      setGeneration((value) => value + 1);
    }, GROUPON_SHARE.sent);
  }, [access, chatId, run, text]);

  return (
    <View style={styles.writer} testID="hub-history-shared-writer">
      {requests.map((request) => (
        <PermissionButtons
          key={request.requestId}
          chatId={chatId}
          requestId={request.requestId}
          toolName={request.toolName}
          busy={busy}
          run={run}
        />
      ))}
      <EditingTextInput
        key={generation}
        initialValue=""
        onChangeText={setText}
        multiline
        editable={!busy}
        placeholder={GROUPON_SHARE.composerPlaceholder}
        style={styles.composer}
        testID="hub-history-shared-composer"
      />
      <Button onPress={send} loading={busy} testID="hub-history-shared-send">
        {GROUPON_SHARE.send}
      </Button>
      {notice ? <Text style={styles.muted}>{notice}</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function PermissionButtons({
  chatId,
  requestId,
  toolName,
  busy,
  run,
}: {
  chatId: string;
  requestId: string;
  toolName: string;
  busy: boolean;
  run: (work: () => Promise<unknown>, done: string) => Promise<void>;
}) {
  const allow = useCallback(
    () => void run(() => answerPermission(chatId, requestId, "allow"), GROUPON_SHARE.answered),
    [chatId, requestId, run],
  );
  const deny = useCallback(
    () => void run(() => answerPermission(chatId, requestId, "deny"), GROUPON_SHARE.answered),
    [chatId, requestId, run],
  );
  return (
    <View style={styles.permission} testID={`hub-history-shared-permission-${requestId}`}>
      <Text style={styles.permissionTitle}>{GROUPON_HISTORY.asked(toolName)}</Text>
      <View style={styles.permissionButtons}>
        <Button size="sm" onPress={allow} disabled={busy}>
          {GROUPON_SHARE.allow}
        </Button>
        <Button size="sm" variant="outline" onPress={deny} disabled={busy}>
          {GROUPON_SHARE.deny}
        </Button>
      </View>
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
  writer: { gap: theme.spacing[2], paddingTop: theme.spacing[2] },
  composer: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  permissionButtons: { flexDirection: "row", gap: theme.spacing[2] },
  notice: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm, textAlign: "center" },
}));
