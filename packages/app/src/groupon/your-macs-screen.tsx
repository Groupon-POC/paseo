// Added for Groupon Desk (fork of Paseo, Apache-2.0): Your Macs, the welcome screen in place of Paseo's Direct connection.

/**
 * The screen a signed-in person with an open vault sees while none of their Macs is connected:
 * the Macs the hub lists (`hub-sync.tsx`), each one opening on tap when its hand is on Core's
 * relay or it is this Mac, and a plain sentence under each one that cannot open. With no Mac
 * past "its hand is not running" (or none at all), the install instructions and one download
 * link. It re-reads the hub every 15 s (more often than the 30 s `GrouponHubSync` keeps for the
 * whole window: here nothing else is on screen to wait for), shows when it last did, and the
 * moment one Mac comes online the window goes straight to it, as Paseo's welcome screen did. The same screen on a phone, where every Mac is
 * reached through Core's relay.
 *
 * Constraints:
 * - No address to type, no pairing, no SSH: `PASEO_MANUAL_HOSTS` is off in every build
 * - No `useUnistyles` (the fork's lint): colours come through `StyleSheet.create`
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { StyleSheet } from "react-native-unistyles";
import { Download, History, RefreshCw, Settings } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { PressHighlight } from "@/components/ui/press-highlight";
import { buildHostRootRoute, buildOpenProjectRoute } from "@/utils/host-routes";
import { openExternalUrl } from "@/utils/open-external-url";
import { GROUPON_DESK_DOWNLOAD_URL } from "./environments";
import { ThemedGrouponMark } from "./groupon-mark";
import { HUB_HISTORY_ROUTE } from "./history-screen";
import { useHubMachinesStore, useOnlineServerIds } from "./hub-sync";
import { thisComputerBadge } from "./mac-picker-model";
import { GROUPON_HISTORY, GROUPON_YOUR_MACS } from "./strings";
import { ThisComputerBadge } from "./this-computer-badge";
import {
  firstConnected,
  seenAgo,
  updatedAt,
  yourMacsModel,
  type YourMacRow,
  type YourMacState,
} from "./your-macs-model";

/** How often the screen re-reads the hub while it shows. */
export const YOUR_MACS_REFRESH_MS = 15_000;

export function YourMacsScreen() {
  const router = useRouter();
  const views = useHubMachinesStore((state) => state.machines);
  const syncing = useHubMachinesStore((state) => state.syncing);
  const lastSyncAt = useHubMachinesStore((state) => state.lastSyncAt);
  const error = useHubMachinesStore((state) => state.error);
  const sync = useHubMachinesStore((state) => state.sync);
  const [now, setNow] = useState(() => new Date());

  const serverIds = useMemo(
    () => views.flatMap((view) => (view.serverId ? [view.serverId] : [])),
    [views],
  );
  const online = useOnlineServerIds(serverIds);
  const model = useMemo(() => {
    const onlineIds = new Set(online.split(",").filter(Boolean));
    return yourMacsModel({
      views,
      isOnline: (serverId) => onlineIds.has(serverId),
      syncing,
      lastSyncAt,
      error,
    });
  }, [views, online, syncing, lastSyncAt, error]);
  const connected = firstConnected(model);

  // Straight to the Mac the moment one is online: nothing to press in between.
  useEffect(() => {
    if (connected) router.replace(buildOpenProjectRoute());
  }, [connected, router]);

  // The hub again every 15 s, until a Mac connects.
  useEffect(() => {
    void sync();
    const timer = setInterval(() => {
      setNow(new Date());
      void sync();
    }, YOUR_MACS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [sync]);

  const handleRefresh = useCallback(() => void sync(), [sync]);
  const handleDownload = useCallback(() => void openExternalUrl(GROUPON_DESK_DOWNLOAD_URL), []);
  const handleHistory = useCallback(() => router.push(HUB_HISTORY_ROUTE), [router]);
  const handleSettings = useCallback(() => router.push("/settings"), [router]);
  const handleOpen = useCallback(
    (serverId: string) => router.replace(buildHostRootRoute(serverId)),
    [router],
  );

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      testID="welcome-screen"
    >
      <View style={styles.column}>
        <ThemedGrouponMark size={132} />
        <Text style={styles.title}>{GROUPON_YOUR_MACS.title}</Text>

        {model.kind === "loading" ? (
          <Text style={styles.muted}>{GROUPON_YOUR_MACS.loading}</Text>
        ) : null}
        {model.kind === "unreadable" ? <Text style={styles.error}>{model.message}</Text> : null}

        {model.kind === "macs" && model.notice === "install" ? (
          <View style={styles.card} testID="your-macs-install">
            <Text style={styles.cardTitle}>{GROUPON_YOUR_MACS.notInstalledTitle}</Text>
            <Text style={styles.body}>{GROUPON_YOUR_MACS.notInstalled}</Text>
            <Button
              variant="default"
              leftIcon={Download}
              onPress={handleDownload}
              testID="your-macs-download"
            >
              {GROUPON_YOUR_MACS.download}
            </Button>
          </View>
        ) : null}

        {model.kind === "macs" && model.notice === "noneServing" ? (
          <View style={styles.card} testID="your-macs-none-serving">
            <Text style={styles.body}>{GROUPON_YOUR_MACS.noneServing}</Text>
          </View>
        ) : null}

        {model.kind === "macs" && model.rows.length > 0 ? (
          <View style={styles.list}>
            {model.rows.map((row) => (
              <MacRow key={row.id} row={row} now={now} onOpen={handleOpen} />
            ))}
          </View>
        ) : null}

        {model.kind === "macs" && error ? (
          <Text style={styles.error}>{GROUPON_YOUR_MACS.loadFailed(error)}</Text>
        ) : null}

        <View style={styles.footer}>
          <Button
            variant="outline"
            size="sm"
            leftIcon={RefreshCw}
            onPress={handleRefresh}
            loading={syncing}
            testID="your-macs-refresh"
          >
            {syncing ? GROUPON_YOUR_MACS.refreshing : GROUPON_YOUR_MACS.refresh}
          </Button>
          <Text style={styles.small}>
            {[updatedAt(lastSyncAt), GROUPON_YOUR_MACS.autoRefresh].filter(Boolean).join(" · ")}
          </Text>
        </View>

        <View style={styles.links}>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={History}
            onPress={handleHistory}
            testID="welcome-open-history"
          >
            {GROUPON_HISTORY.title}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={Settings}
            onPress={handleSettings}
            testID="welcome-open-settings"
          >
            {GROUPON_YOUR_MACS.settings}
          </Button>
        </View>
      </View>
    </ScrollView>
  );
}

const STATE_LABEL: Record<YourMacState, string> = {
  connected: GROUPON_YOUR_MACS.connected,
  connecting: GROUPON_YOUR_MACS.connecting,
  noHand: GROUPON_YOUR_MACS.notRunning,
  otherVault: "",
  failed: "",
};

function dotStyleOf(state: YourMacState) {
  if (state === "connected") return styles.dotConnected;
  if (state === "connecting") return styles.dotConnecting;
  return styles.dotIdle;
}

function MacRow({
  row,
  now,
  onOpen,
}: {
  row: YourMacRow;
  now: Date;
  onOpen: (serverId: string) => void;
}) {
  const { openServerId } = row;
  const handlePress = useCallback(() => {
    if (openServerId) onOpen(openServerId);
  }, [onOpen, openServerId]);
  const details = [
    row.isPrimary ? GROUPON_YOUR_MACS.primary : null,
    GROUPON_YOUR_MACS.lastSeen(seenAgo(row.lastSeenAt, now)),
  ]
    .filter(Boolean)
    .join(" · ");
  const opens = openServerId !== null;
  const dotStyle = dotStyleOf(row.state);

  return (
    <PressHighlight
      style={opens ? styles.rowOpens : styles.row}
      onPress={opens ? handlePress : undefined}
      disabled={!opens}
      accessibilityRole={opens ? "button" : undefined}
      testID={`your-macs-row-${row.id}`}
    >
      <View style={styles.rowHead}>
        <View style={dotStyle} />
        <View style={styles.rowName}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {row.label}
          </Text>
          <ThisComputerBadge
            badge={thisComputerBadge(row.isThisMac)}
            testID={`your-macs-this-computer-${row.id}`}
          />
        </View>
        <Text style={styles.small}>{STATE_LABEL[row.state]}</Text>
      </View>
      <Text style={styles.small}>{details}</Text>
      {row.message ? <Text style={styles.body}>{row.message}</Text> : null}
      {row.hint ? <Text style={styles.small}>{row.hint}</Text> : null}
    </PressHighlight>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: theme.spacing[6],
  },
  column: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    alignItems: "center",
    gap: theme.spacing[4],
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize["2xl"],
    fontWeight: theme.fontWeight.semibold,
  },
  card: {
    width: "100%",
    gap: theme.spacing[3],
    padding: theme.spacing[4],
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface1,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
  list: {
    width: "100%",
    gap: theme.spacing[2],
  },
  row: {
    width: "100%",
    gap: theme.spacing[1],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  rowOpens: {
    width: "100%",
    gap: theme.spacing[1],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  rowHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  rowName: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    gap: theme.spacing[2],
    minWidth: 0,
  },
  rowTitle: {
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  dotConnected: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.statusSuccess,
  },
  dotConnecting: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.statusWarning,
  },
  dotIdle: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.foregroundMuted,
  },
  body: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  muted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  small: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
  footer: {
    alignItems: "center",
    gap: theme.spacing[1],
  },
  links: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
}));
