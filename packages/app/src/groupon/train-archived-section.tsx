// Added for Groupon Desk (fork of Paseo, Apache-2.0): Settings > Groupon, Restore for the workspaces a release train archived.

/**
 * One card per connected Mac: the workspaces its daemon archived when a release train merged
 * (`train-archived-model.ts`), each with Restore (Paseo's workspace recovery, which recreates a
 * deleted worktree from its branch). A Mac with none says so; a Mac whose daemon predates the list
 * shows the daemon's error line.
 */

import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { Button } from "@/components/ui/button";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected, useHosts } from "@/runtime/host-runtime";
import { settingsStyles } from "@/styles/settings";
import { GROUPON_TRAIN_ARCHIVED } from "./strings";
import {
  readTrainArchived,
  trainArchivedHint,
  type TrainArchivedWorkspace,
} from "./train-archived-model";

function RestoreRow({
  workspace,
  onRestore,
}: {
  workspace: TrainArchivedWorkspace;
  onRestore: (workspaceId: string) => Promise<void>;
}) {
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  });
  const handleRestore = useCallback(() => {
    setState({ busy: true, error: null });
    onRestore(workspace.workspaceId).then(
      () => setState({ busy: false, error: null }),
      (error: unknown) =>
        setState({ busy: false, error: error instanceof Error ? error.message : String(error) }),
    );
  }, [onRestore, workspace.workspaceId]);
  return (
    <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{workspace.name}</Text>
        <Text style={settingsStyles.rowHint}>{trainArchivedHint(workspace)}</Text>
        {state.error ? <Text style={styles.error}>{state.error}</Text> : null}
      </View>
      <Button
        variant="outline"
        size="sm"
        onPress={handleRestore}
        loading={state.busy}
        testID={`groupon-train-restore-${workspace.workspaceId}`}
      >
        {GROUPON_TRAIN_ARCHIVED.restore}
      </Button>
    </View>
  );
}

function MacTrainArchived({ serverId, label }: { serverId: string; label: string }) {
  const client = useHostRuntimeClient(serverId);
  const connected = useHostRuntimeIsConnected(serverId);
  const query = useFetchQuery({
    queryKey: ["groupon-train-archived", serverId],
    queryFn: async () => {
      if (!client) throw new Error(GROUPON_TRAIN_ARCHIVED.notConnected);
      return readTrainArchived(client);
    },
    enabled: Boolean(client) && connected,
    dataShape: "value",
    retry: false,
    staleTimeMs: 0,
  });
  const refetch = query.refetch;
  const restore = useCallback(
    async (workspaceId: string) => {
      if (!client) throw new Error(GROUPON_TRAIN_ARCHIVED.notConnected);
      await client.restoreWorkspace(workspaceId);
      await refetch();
    },
    [client, refetch],
  );
  const workspaces = query.data ?? [];
  let status: string | null = null;
  if (!connected) status = GROUPON_TRAIN_ARCHIVED.notConnected;
  else if (query.error) status = query.error.message;
  else if (query.isFetching && !query.data) status = GROUPON_TRAIN_ARCHIVED.reading;
  else if (query.data && workspaces.length === 0) status = GROUPON_TRAIN_ARCHIVED.none;
  return (
    <View testID={`groupon-train-archived-${serverId}`}>
      <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>{label}</Text>
          {status ? <Text style={settingsStyles.rowHint}>{status}</Text> : null}
        </View>
      </View>
      {workspaces.map((workspace) => (
        <RestoreRow key={workspace.workspaceId} workspace={workspace} onRestore={restore} />
      ))}
    </View>
  );
}

export function GrouponTrainArchivedSection() {
  const hosts = useHosts();
  return (
    <SettingsSection title={GROUPON_TRAIN_ARCHIVED.title}>
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowHint}>{GROUPON_TRAIN_ARCHIVED.intro}</Text>
          </View>
        </View>
        {hosts.map((host) => (
          <MacTrainArchived key={host.serverId} serverId={host.serverId} label={host.label} />
        ))}
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
}));
