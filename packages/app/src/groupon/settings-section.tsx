// Added for Groupon Desk (fork of Paseo, Apache-2.0): Settings > Groupon, the account and the vault.
import { useCallback } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { isWeb } from "@/constants/platform";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { Button } from "@/components/ui/button";
import { settingsStyles } from "@/styles/settings";
import { environmentById } from "./environments";
import { useGrouponStore } from "./session";
import { GROUPON_SETTINGS } from "./strings";

function Row({
  title,
  hint,
  value,
  border,
}: {
  title: string;
  hint?: string;
  value?: string;
  border?: boolean;
}) {
  return (
    <View style={border ? [settingsStyles.row, settingsStyles.rowBorder] : settingsStyles.row}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{title}</Text>
        {hint ? <Text style={settingsStyles.rowHint}>{hint}</Text> : null}
      </View>
      {value ? (
        <Text style={styles.value} selectable>
          {value}
        </Text>
      ) : null}
    </View>
  );
}

export function GrouponAccountSection() {
  const environmentId = useGrouponStore((state) => state.environmentId);
  const coreUrl = useGrouponStore((state) => state.coreUrl);
  const identity = useGrouponStore((state) => state.identity);
  const lastUnlock = useGrouponStore((state) => state.lastUnlock);
  const signOut = useGrouponStore((state) => state.signOut);
  const handleSignOut = useCallback(() => void signOut(), [signOut]);
  let vaultHint: string = isWeb ? GROUPON_SETTINGS.vaultKeptWeb : GROUPON_SETTINGS.vaultKept;
  if (lastUnlock) {
    vaultHint = GROUPON_SETTINGS.vaultMeasured(
      lastUnlock.ms,
      lastUnlock.iterations,
      lastUnlock.engine,
    );
  }

  return (
    <SettingsSection title={GROUPON_SETTINGS.account}>
      <View style={settingsStyles.card}>
        <Row title={GROUPON_SETTINGS.signedInAs} value={identity?.email ?? identity?.name ?? "?"} />
        <Row
          title={GROUPON_SETTINGS.core}
          hint={coreUrl}
          value={environmentById(environmentId).label}
          border
        />
        <Row title={GROUPON_SETTINGS.vault} hint={vaultHint} border />
        <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
          <Button variant="outline" size="sm" onPress={handleSignOut} testID="groupon-sign-out">
            {GROUPON_SETTINGS.signOut}
          </Button>
        </View>
      </View>
    </SettingsSection>
  );
}

export function GrouponSettingsPage() {
  return <GrouponAccountSection />;
}

const styles = StyleSheet.create((theme) => ({
  value: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
