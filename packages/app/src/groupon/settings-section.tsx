// Added for Groupon Desk (fork of Paseo, Apache-2.0): Settings > Groupon, the account and the vault.
import { useCallback } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { StyleSheet } from "react-native-unistyles";
import { isWeb } from "@/constants/platform";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { Button } from "@/components/ui/button";
import { settingsStyles } from "@/styles/settings";
import { environmentById } from "./environments";
import { useHubMachinesStore, type HubMachineState, type HubMachineView } from "./hub-sync";
import { useGrouponStore } from "./session";
import { GROUPON_HISTORY, GROUPON_MACHINES, GROUPON_SETTINGS } from "./strings";
import { HUB_HISTORY_ROUTE } from "./history-screen";

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

const STATE_TEXT: Record<HubMachineState, string> = {
  added: GROUPON_MACHINES.added,
  noOffer: GROUPON_MACHINES.noOffer,
  sealedElsewhere: GROUPON_MACHINES.sealedElsewhere,
  failed: GROUPON_MACHINES.failed,
};

function relayText(view: HubMachineView): string {
  if (view.direct) return `${GROUPON_MACHINES.direct} ${view.direct}`;
  if (!view.machine.relaySessionId) return GROUPON_MACHINES.noRelay;
  const state = view.machine.relayConnectedAt
    ? GROUPON_MACHINES.relayConnected
    : GROUPON_MACHINES.relayNotConnected;
  return view.relay ? `${state} ${GROUPON_MACHINES.relayAt(view.relay)}` : state;
}

export function GrouponMachinesSection() {
  const machines = useHubMachinesStore((state) => state.machines);
  const syncing = useHubMachinesStore((state) => state.syncing);
  const error = useHubMachinesStore((state) => state.error);
  const sync = useHubMachinesStore((state) => state.sync);
  const handleRefresh = useCallback(() => void sync(), [sync]);

  return (
    <SettingsSection title={GROUPON_MACHINES.title}>
      <View style={settingsStyles.card}>
        {machines.length === 0 ? <Row title={GROUPON_MACHINES.empty} /> : null}
        {machines.map((view, index) => (
          <Row
            key={view.machine.machine}
            title={view.machine.isPrimary ? `${view.label} (main)` : view.label}
            hint={[
              STATE_TEXT[view.state],
              relayText(view),
              GROUPON_MACHINES.lastSeen(new Date(view.machine.lastSeenAt).toLocaleString()),
              view.error,
            ]
              .filter(Boolean)
              .join(" · ")}
            value={view.serverId ?? undefined}
            border={index > 0}
          />
        ))}
        <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
          <Button
            variant="outline"
            size="sm"
            onPress={handleRefresh}
            loading={syncing}
            testID="groupon-machines-refresh"
          >
            {syncing ? GROUPON_MACHINES.refreshing : GROUPON_MACHINES.refresh}
          </Button>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </View>
    </SettingsSection>
  );
}

export function GrouponHistorySection() {
  const router = useRouter();
  const handleOpen = useCallback(() => router.push(HUB_HISTORY_ROUTE), [router]);
  return (
    <SettingsSection title={GROUPON_HISTORY.title}>
      <View style={settingsStyles.card}>
        <Row title={GROUPON_HISTORY.openHint} />
        <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
          <Button variant="outline" size="sm" onPress={handleOpen} testID="groupon-open-history">
            {GROUPON_HISTORY.open}
          </Button>
        </View>
      </View>
    </SettingsSection>
  );
}

export function GrouponSettingsPage() {
  return (
    <>
      <GrouponAccountSection />
      <GrouponHistorySection />
      <GrouponMachinesSection />
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  value: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
}));
