// Added for Groupon Desk (fork of Paseo, Apache-2.0): the General settings switches for the worktree-scripts reminder and for Local on a shared branch. And for My tasks.

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
  const inPlace = useGrouponPreferences((state) => state.localInPlaceOnTrunk ?? false);
  const setInPlace = useGrouponPreferences((state) => state.setLocalInPlaceOnTrunk);
  const showMyTasks = useGrouponPreferences((state) => state.showMyTasks ?? true);
  const setShowMyTasks = useGrouponPreferences((state) => state.setShowMyTasks);
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
        <View
          style={[settingsStyles.row, settingsStyles.rowBorder]}
          testID="groupon-local-in-place-on-trunk-row"
        >
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{GROUPON_PREFERENCES.localInPlaceOnTrunk}</Text>
            <Text style={settingsStyles.rowHint}>
              {GROUPON_PREFERENCES.localInPlaceOnTrunkHint}
            </Text>
          </View>
          <Switch
            value={inPlace}
            onValueChange={setInPlace}
            accessibilityLabel={GROUPON_PREFERENCES.localInPlaceOnTrunk}
            testID="groupon-local-in-place-on-trunk-switch"
          />
        </View>
        <View
          style={[settingsStyles.row, settingsStyles.rowBorder]}
          testID="groupon-show-my-tasks-row"
        >
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{GROUPON_PREFERENCES.showMyTasks}</Text>
            <Text style={settingsStyles.rowHint}>{GROUPON_PREFERENCES.showMyTasksHint}</Text>
          </View>
          <Switch
            value={showMyTasks}
            onValueChange={setShowMyTasks}
            accessibilityLabel={GROUPON_PREFERENCES.showMyTasks}
            testID="groupon-show-my-tasks-switch"
          />
        </View>
      </View>
    </SettingsSection>
  );
}
