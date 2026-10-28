// Added for Groupon Desk (fork of Paseo, Apache-2.0): the chat's display mode, picked under the composer.

import { Eye } from "lucide-react-native";
import { useCallback, useMemo } from "react";
import { withUnistyles } from "react-native-unistyles";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DropdownTrigger } from "@/components/ui/dropdown-trigger";
import { useAppSettings, type ChatDisplayMode } from "@/hooks/use-settings";
import type { Theme } from "@/styles/theme";
import { GROUPON_CHAT_DISPLAY } from "./strings";

const MODES: readonly ChatDisplayMode[] = ["all", "fluent", "output"];
const ThemedEye = withUnistyles(Eye);
const mutedColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export function ChatDisplayModeControl() {
  const { settings, updateSettings } = useAppSettings();
  const mode = settings.chatDisplayMode;
  const leading = useMemo(() => <ThemedEye size={14} uniProps={mutedColor} />, []);
  const selectMode = useCallback(
    (next: ChatDisplayMode) => void updateSettings({ chatDisplayMode: next }),
    [updateSettings],
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
          <ModeOption key={value} value={value} selected={value === mode} onSelect={selectMode} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ModeOption({
  value,
  selected,
  onSelect,
}: {
  value: ChatDisplayMode;
  selected: boolean;
  onSelect: (value: ChatDisplayMode) => void;
}) {
  const select = useCallback(() => onSelect(value), [onSelect, value]);
  return (
    <DropdownMenuItem selected={selected} onSelect={select} testID={`chat-display-mode-${value}`}>
      {GROUPON_CHAT_DISPLAY.options[value]}
    </DropdownMenuItem>
  );
}
