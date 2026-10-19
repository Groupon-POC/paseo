// Added for Groupon Desk (fork of Paseo, Apache-2.0): one line of text the person copies with a button.

/**
 * A line the person takes elsewhere (the work window's web address, the command that signs gh in
 * to a GitHub host): the text in a monospaced box they can select, and a Copy button that says
 * Copied for two seconds.
 */

import * as Clipboard from "expo-clipboard";
import { Check, Copy } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { GROUPON_COPY } from "./strings";

const COPIED_FOR_MS = 2000;

interface CopyLineProps {
  text: string;
  accessibilityLabel: string;
  /** `<testID>-text` on the line, `<testID>-copy` on the button. */
  testID: string;
}

export function CopyLine({ text, accessibilityLabel, testID }: CopyLineProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = useCallback(async () => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_FOR_MS);
  }, [text]);
  const handleCopy = useCallback(() => void copy(), [copy]);
  return (
    <View style={styles.row}>
      <View style={styles.box}>
        <Text
          style={styles.text}
          selectable
          numberOfLines={1}
          accessibilityLabel={accessibilityLabel}
          testID={`${testID}-text`}
        >
          {text}
        </Text>
      </View>
      <Button
        variant="outline"
        size="sm"
        leftIcon={copied ? Check : Copy}
        onPress={handleCopy}
        testID={`${testID}-copy`}
      >
        {copied ? GROUPON_COPY.copied : GROUPON_COPY.copy}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  box: {
    flex: 1,
    minWidth: 0,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
  text: {
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
  },
}));
