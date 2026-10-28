// Added for Groupon Desk (fork of Paseo, Apache-2.0): Settings > Sidebar's switch for "New chat", the row that always leads the sidebar.

import { MessageSquarePlus } from "lucide-react-native";
import { useCallback, useMemo, type ReactElement } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Shortcut } from "@/components/ui/shortcut";
import { Switch } from "@/components/ui/switch";
import { useAppSettings } from "@/hooks/use-settings";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import { settingsStyles } from "@/styles/settings";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import { GROUPON_CHATS } from "./strings";

const ThemedIcon = withUnistyles(MessageSquarePlus);
const mutedColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/** The first row of the header card: shown or hidden, never moved, since it always leads. */
export function NewChatSidebarSetting(): ReactElement {
  const { settings, updateSettings } = useAppSettings();
  const chord = useShortcutKeys("new-chat");
  const setVisible = useCallback(
    (visible: boolean) => void updateSettings({ sidebarNewChatRow: visible }),
    [updateSettings],
  );
  const rowStyle = useMemo(() => [settingsStyles.row, styles.row], []);
  return (
    <View style={rowStyle} testID="sidebar-nav-item-new-chat">
      <View style={styles.main}>
        <ThemedIcon size={ICON_SIZE.md} uniProps={mutedColor} />
        <Text style={settingsStyles.rowTitle} numberOfLines={1}>
          {GROUPON_CHATS.newChat}
        </Text>
        {chord ? <Shortcut chord={chord} /> : null}
      </View>
      <Switch
        value={settings.sidebarNewChatRow}
        onValueChange={setVisible}
        accessibilityLabel={GROUPON_CHATS.newChat}
        testID="sidebar-nav-toggle-new-chat"
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    gap: theme.spacing[2],
  },
  main: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
}));
