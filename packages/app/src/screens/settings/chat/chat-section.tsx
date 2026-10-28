// Changed for Groupon Desk (fork of Paseo, Apache-2.0): the chat's display mode and shell call titles.
import { useCallback, useMemo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  SettingsCard,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@/components/settings";
import { isNative } from "@/constants/platform";
import { useAppSettings, type AppSettings } from "@/hooks/use-settings";
import { GROUPON_CHAT_DISPLAY } from "@/groupon/strings";

const DISPLAY_MODE_OPTIONS = (["all", "fluent", "output"] as const).map((value) => ({
  value,
  label: GROUPON_CHAT_DISPLAY.options[value],
}));

const TOOL_CALL_DETAIL_LEVELS: readonly AppSettings["toolCallDetailLevel"][] = [
  "detailed",
  "overview",
];

export function ChatSection() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();

  const toolCallDetailOptions = useMemo(
    () =>
      TOOL_CALL_DETAIL_LEVELS.map((value) => ({
        value,
        label: t(`settings.general.toolCallDetail.options.${value}`),
      })),
    [t],
  );

  const changeToolCallDetailLevel = useCallback(
    (toolCallDetailLevel: AppSettings["toolCallDetailLevel"]) =>
      void updateSettings({ toolCallDetailLevel }),
    [updateSettings],
  );
  const changeAutoExpandReasoning = useCallback(
    (autoExpandReasoning: boolean) => void updateSettings({ autoExpandReasoning }),
    [updateSettings],
  );
  const changeChatOutline = useCallback(
    (chatOutlineEnabled: boolean) => void updateSettings({ chatOutlineEnabled }),
    [updateSettings],
  );
  const changeDisplayMode = useCallback(
    (chatDisplayMode: AppSettings["chatDisplayMode"]) => void updateSettings({ chatDisplayMode }),
    [updateSettings],
  );
  const changeToolCallDescriptions = useCallback(
    (toolCallDescriptions: boolean) => void updateSettings({ toolCallDescriptions }),
    [updateSettings],
  );

  return (
    <View>
      <SettingsSection title={t("settings.appearance.detailLevel.title")}>
        <SettingsCard>
          <SettingsSwitch
            label={t("settings.general.autoExpandReasoning.label")}
            hint={t("settings.general.autoExpandReasoning.description")}
            value={settings.autoExpandReasoning}
            onValueChange={changeAutoExpandReasoning}
          />
          <SettingsSelect
            label={GROUPON_CHAT_DISPLAY.label}
            hint={GROUPON_CHAT_DISPLAY.hint}
            value={settings.chatDisplayMode}
            options={DISPLAY_MODE_OPTIONS}
            onValueChange={changeDisplayMode}
          />
          <SettingsSwitch
            label={GROUPON_CHAT_DISPLAY.descriptions}
            hint={GROUPON_CHAT_DISPLAY.descriptionsHint}
            value={settings.toolCallDescriptions}
            onValueChange={changeToolCallDescriptions}
          />
          <SettingsSelect
            label={t("settings.general.toolCallDetail.label")}
            hint={t("settings.general.toolCallDetail.description")}
            value={settings.toolCallDetailLevel}
            options={toolCallDetailOptions}
            onValueChange={changeToolCallDetailLevel}
          />
          {isNative ? null : (
            <SettingsSwitch
              label={t("settings.appearance.chatOutline.title")}
              hint={t("settings.appearance.chatOutline.description")}
              value={settings.chatOutlineEnabled}
              onValueChange={changeChatOutline}
            />
          )}
        </SettingsCard>
      </SettingsSection>
    </View>
  );
}
