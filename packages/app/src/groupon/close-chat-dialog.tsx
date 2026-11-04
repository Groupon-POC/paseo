// Added for Groupon Desk (fork of Paseo, Apache-2.0): the window's own dialog before a chat's tab closes: what goes to the archive, Return to go on, Esc to stay.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { isWeb } from "@/constants/platform";
import type { CloseChatDialogContent } from "./close-chat-model";
import { GROUPON_CLOSE_CHAT } from "./strings";

const DIALOG_WIDTH = 420;
const SNAP_POINTS = ["40%"];

export interface CloseChatDialog {
  ask: (content: CloseChatDialogContent) => Promise<boolean>;
  element: ReactElement | null;
}

export function useCloseChatDialog(): CloseChatDialog {
  const [content, setContent] = useState<CloseChatDialogContent | null>(null);
  const settle = useRef<((confirmed: boolean) => void) | null>(null);

  const finish = useCallback((confirmed: boolean) => {
    settle.current?.(confirmed);
    settle.current = null;
    setContent(null);
  }, []);
  const cancel = useCallback(() => finish(false), [finish]);
  const confirm = useCallback(() => finish(true), [finish]);

  const ask = useCallback((next: CloseChatDialogContent) => {
    settle.current?.(false);
    return new Promise<boolean>((resolve) => {
      settle.current = resolve;
      setContent(next);
    });
  }, []);

  const open = content !== null;
  useEffect(() => {
    if (!open || !isWeb) return undefined;
    (document.activeElement as HTMLElement | null)?.blur?.();
    // Capture, so Return never reaches the composer behind the dialog.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "Enter" && event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      finish(event.key === "Enter");
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [finish, open]);

  const header = useMemo(() => ({ title: content?.title ?? "" }), [content?.title]);
  const footer = useMemo(
    () =>
      content ? (
        <View style={styles.footer}>
          <Button variant="outline" size="sm" onPress={cancel} testID="close-chat-cancel">
            {GROUPON_CLOSE_CHAT.cancel}
          </Button>
          <Button variant="destructive" size="sm" onPress={confirm} testID="close-chat-confirm">
            {content.confirmLabel}
          </Button>
        </View>
      ) : null,
    [cancel, confirm, content],
  );

  const element = content ? (
    <AdaptiveModalSheet
      header={header}
      visible
      onClose={cancel}
      footer={footer}
      snapPoints={SNAP_POINTS}
      desktopMaxWidth={DIALOG_WIDTH}
      testID="close-chat-dialog"
    >
      <View style={styles.body}>
        <Text style={styles.message}>{content.message}</Text>
        {content.warnings.map((warning) => (
          <Text key={warning} style={styles.warning}>
            {warning}
          </Text>
        ))}
      </View>
    </AdaptiveModalSheet>
  ) : null;

  return { ask, element };
}

const styles = StyleSheet.create((theme) => ({
  body: {
    gap: theme.spacing[2],
  },
  message: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  warning: {
    color: theme.colors.statusWarning,
    fontSize: theme.fontSize.sm,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
}));
