// Added for Groupon Desk (fork of Paseo, Apache-2.0): the chat's display mode, picked under the composer, and Live's switch for the failed tool calls beside its check.

import { Check, Eye, TriangleAlert } from "lucide-react-native";
import { useCallback, useMemo, type ReactElement } from "react";
import { View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DropdownTrigger } from "@/components/ui/dropdown-trigger";
import { PressHighlight } from "@/components/ui/press-highlight";
import { useAppSettings, type ChatDisplayMode } from "@/hooks/use-settings";
import type { Theme } from "@/styles/theme";
import { GROUPON_CHAT_DISPLAY } from "./strings";

const MODES: readonly ChatDisplayMode[] = ["all", "live", "output"];
const ThemedEye = withUnistyles(Eye);
const ThemedCheck = withUnistyles(Check);
const ThemedTriangleAlert = withUnistyles(TriangleAlert);
const mutedColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
// The colour the chat draws a failed tool call's icon in, so the switch reads as that row.
const failedColor = (theme: Theme) => ({ color: theme.colors.destructive });

export function ChatDisplayModeControl() {
  const { settings, updateSettings } = useAppSettings();
  const mode = settings.chatDisplayMode;
  const showFailed = settings.liveShowsFailedTools;
  const leading = useMemo(() => <ThemedEye size={14} uniProps={mutedColor} />, []);
  const selectMode = useCallback(
    (next: ChatDisplayMode) => void updateSettings({ chatDisplayMode: next }),
    [updateSettings],
  );
  const toggleFailed = useCallback(
    () => void updateSettings({ liveShowsFailedTools: !showFailed }),
    [updateSettings, showFailed],
  );
  return (
    <DropdownMenu>
      <DropdownTrigger
        size="xs"
        leading={leading}
        accessibilityRole="button"
        accessibilityLabel={`${GROUPON_CHAT_DISPLAY.label}: ${GROUPON_CHAT_DISPLAY.options[mode]}`}
        testID="composer-chat-display-mode"
      >
        {GROUPON_CHAT_DISPLAY.options[mode]}
      </DropdownTrigger>
      <DropdownMenuContent side="top" align="end" width={180}>
        {MODES.map((value) => (
          <ModeOption
            key={value}
            value={value}
            selected={value === mode}
            onSelect={selectMode}
            showFailed={showFailed}
            onToggleFailed={toggleFailed}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ModeOption({
  value,
  selected,
  onSelect,
  showFailed,
  onToggleFailed,
}: {
  value: ChatDisplayMode;
  selected: boolean;
  onSelect: (value: ChatDisplayMode) => void;
  showFailed: boolean;
  onToggleFailed: () => void;
}) {
  const select = useCallback(() => onSelect(value), [onSelect, value]);
  // Only Live has the switch; passing `trailing` replaces the item's own check, so it is drawn here.
  const trailing = useMemo(
    () =>
      value === "live" ? (
        <View style={styles.trailing}>
          <FailedToolsSwitch on={showFailed} onToggle={onToggleFailed} />
          <View style={styles.checkSlot}>
            {selected ? <ThemedCheck size={16} uniProps={mutedColor} /> : null}
          </View>
        </View>
      ) : undefined,
    [value, showFailed, onToggleFailed, selected],
  );
  return (
    <DropdownMenuItem
      selected={selected}
      onSelect={select}
      trailing={trailing}
      testID={`chat-display-mode-${value}`}
    >
      {GROUPON_CHAT_DISPLAY.options[value]}
    </DropdownMenuItem>
  );
}

/**
 * Live shows the failed tool calls while this is on. A press here stays here: the web press
 * reaches only the nearest pressable, so the row is not picked and the menu stays open.
 */
function FailedToolsSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }): ReactElement {
  const label = on ? GROUPON_CHAT_DISPLAY.hideFailed : GROUPON_CHAT_DISPLAY.showFailed;
  const accessibilityState = useMemo(() => ({ checked: on }), [on]);
  const pressStyle = useCallback(
    ({ pressed, hovered = false }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.switch,
      hovered || pressed ? styles.switchHovered : null,
      on ? null : styles.switchOff,
    ],
    [on],
  );
  return (
    <PressHighlight
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={accessibilityState}
      onPress={onToggle}
      style={pressStyle}
      testID="chat-display-live-failed"
    >
      <ThemedTriangleAlert size={13} uniProps={on ? failedColor : mutedColor} />
    </PressHighlight>
  );
}

const styles = StyleSheet.create((theme) => ({
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  checkSlot: {
    width: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  switch: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.sm,
  },
  switchHovered: {
    backgroundColor: theme.colors.surface3,
  },
  switchOff: {
    opacity: 0.45,
  },
}));
