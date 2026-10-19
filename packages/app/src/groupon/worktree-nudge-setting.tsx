// Added for Groupon Desk (fork of Paseo, Apache-2.0): the General settings switch for the worktree-scripts reminder.

import { Text, View } from "react-native";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { Switch } from "@/components/ui/switch";
import { settingsStyles } from "@/styles/settings";
import { useGrouponPreferences } from "./preferences";
import { GROUPON_PREFERENCES } from "./strings";

/** Off by default: the "Set up worktree scripts" card shows only for someone who turns this on. */
export function WorktreeNudgeSetting() {
  const remind = useGrouponPreferences((state) => state.remindWorktreeScripts);
  const setRemind = useGrouponPreferences((state) => state.setRemindWorktreeScripts);
  return (
    <SettingsSection title={GROUPON_PREFERENCES.section}>
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row} testID="groupon-remind-worktree-scripts-row">
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{GROUPON_PREFERENCES.remindWorktreeScripts}</Text>
            <Text style={settingsStyles.rowHint}>
              {GROUPON_PREFERENCES.remindWorktreeScriptsHint}
            </Text>
          </View>
          <Switch
            value={remind}
            onValueChange={setRemind}
            accessibilityLabel={GROUPON_PREFERENCES.remindWorktreeScripts}
            testID="groupon-remind-worktree-scripts-switch"
          />
        </View>
      </View>
    </SettingsSection>
  );
}
