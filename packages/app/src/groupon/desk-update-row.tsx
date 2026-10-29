// Added for Groupon Desk (fork of Paseo, Apache-2.0): the sidebar's "an update is available" row.

/**
 * One row above Connected computers when this Mac's Groupon Desk or its `groupon` CLI is behind
 * the company's shelf (owner, 2026-10-29): what is newer and "Download and update", which runs
 * `groupon update` through the Groupon plugin (`groupon.desk-update`). Groupon Desk restarts once
 * the new version is in place, so the window closes with it.
 *
 * Constraints:
 * - Only on a Mac with a local daemon (the desktop app); the web build shows nothing
 * - Read every 30 minutes; the daemon keeps its answer ten minutes
 */

import { Download } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { useFetchQuery } from "@/data/query";
import { useLocalDaemonServerId } from "@/hooks/use-is-local-daemon";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { readDeskUpdate } from "./desk-plugin-rpc";
import { deskUpdateWhat } from "./desk-update-model";
import { GROUPON_DESK_UPDATE } from "./strings";

const UPDATE_CHECK_MS = 30 * 60_000;

export function DeskUpdateSidebarRow() {
  const serverId = useLocalDaemonServerId();
  const client = useHostRuntimeClient(serverId ?? "");
  const [installing, setInstalling] = useState<string | null>(null);
  const query = useFetchQuery({
    queryKey: ["groupon-desk-update", serverId],
    queryFn: async () => {
      if (!client) throw new Error("This Mac is not connected.");
      return readDeskUpdate(client, "check");
    },
    enabled: Boolean(client),
    dataShape: "value",
    retry: false,
    staleTimeMs: UPDATE_CHECK_MS,
    refetchInterval: UPDATE_CHECK_MS,
  });
  const what = deskUpdateWhat(query.data);
  const handleInstall = useCallback(async () => {
    if (!client) return;
    setInstalling(GROUPON_DESK_UPDATE.starting);
    try {
      const answer = await readDeskUpdate(client, "install");
      setInstalling(answer.install?.message ?? GROUPON_DESK_UPDATE.starting);
    } catch (error) {
      setInstalling(error instanceof Error ? error.message : String(error));
    }
  }, [client]);
  if (!serverId || !what) return null;
  return (
    <View style={styles.row} testID="sidebar-desk-update">
      <Text style={styles.text} numberOfLines={2}>
        {installing ?? GROUPON_DESK_UPDATE.available(what)}
      </Text>
      {installing ? null : (
        <Button variant="secondary" size="xs" leftIcon={Download} onPress={() => void handleInstall()}>
          {GROUPON_DESK_UPDATE.action}
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    marginHorizontal: theme.spacing[2],
    marginTop: theme.spacing[2],
    paddingVertical: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface2,
  },
  text: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
}));
