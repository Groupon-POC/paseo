// Added for Groupon Desk (fork of Paseo, Apache-2.0): Paseo's History screen waits for a Mac and reads again when one connects.

/**
 * The hook Paseo's History screen (`screens/sessions-screen.tsx`) passes its state through: which
 * of the person's Macs are online (the hosts Paseo knows and the Macs the hub names,
 * `useOnlineServerIds`), and while none in scope is, no "<Mac>: Could not load history", no load
 * error and no "No sessions yet", but "Waiting for a Mac"; whenever a Mac comes online, History is
 * read again. The rules are `history-wait-model.ts`. The screen's own branches stay as upstream
 * has them: it reads the values this returns in place of its own.
 */

import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useHosts } from "@/runtime/host-runtime";
import { historyWaitingForMac, shouldRereadHistory } from "./history-wait-model";
import { useHubMachinesStore, useOnlineServerIds } from "./hub-sync";
import { GROUPON_HISTORY } from "./strings";

const ThemedSpinner = withUnistyles(LoadingSpinner, (theme) => ({
  color: theme.colors.foregroundMuted,
}));

const NO_HOST_ERRORS: never[] = [];

export interface HistoryMacWait<THostError> {
  /** No Mac in scope is online. */
  waiting: boolean;
  /** The screen's host errors, none while it waits. */
  hostErrors: THostError[];
  /** The screen's load error, never while it waits. */
  isError: boolean;
  /** Whether the screen's "No sessions" state may show: an empty list and a Mac to ask. */
  emptyShown: boolean;
  /** "Waiting for a Mac", in place of the empty state; null otherwise. */
  view: ReactNode;
}

export function useHistoryMacWait<THostError>(input: {
  /** The host the screen is filtered to; null for every host. */
  serverId: string | null;
  isInitialLoad: boolean;
  isRevalidating: boolean;
  isError: boolean;
  hostErrors: THostError[];
  agentCount: number;
  reread: () => Promise<void>;
}): HistoryMacWait<THostError> {
  const hosts = useHosts();
  const machines = useHubMachinesStore((state) => state.machines);
  const knownKey = useMemo(() => {
    const ids = new Set(hosts.map((host) => host.serverId));
    for (const view of machines) {
      if (view.serverId) ids.add(view.serverId);
    }
    return [...ids].sort().join(",");
  }, [hosts, machines]);
  const knownIds = useMemo(() => (knownKey.length > 0 ? knownKey.split(",") : []), [knownKey]);
  const online = useOnlineServerIds(knownIds);
  const scopeServerIds = useMemo(
    () => (input.serverId ? [input.serverId] : hosts.map((host) => host.serverId)),
    [hosts, input.serverId],
  );
  const waiting = historyWaitingForMac({ scopeServerIds, online });

  const previousOnline = useRef(online);
  const busy = input.isInitialLoad || input.isRevalidating;
  const { reread } = input;
  useEffect(() => {
    const previous = previousOnline.current;
    previousOnline.current = online;
    if (shouldRereadHistory({ previousOnline: previous, online, busy })) void reread();
  }, [online, busy, reread]);

  const empty = input.agentCount === 0;
  return {
    waiting,
    hostErrors: waiting ? NO_HOST_ERRORS : input.hostErrors,
    isError: input.isError && !waiting,
    emptyShown: empty && !waiting,
    view: waiting && empty && !input.isInitialLoad ? <WaitingForMac /> : null,
  };
}

function WaitingForMac() {
  return (
    <View style={styles.container} testID="sessions-waiting-for-mac">
      <ThemedSpinner size="large" />
      <Text style={styles.title}>{GROUPON_HISTORY.waitingForMac}</Text>
      <Text style={styles.hint}>{GROUPON_HISTORY.waitingForMacHint}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing[4],
    padding: theme.spacing[6],
  },
  title: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  hint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
    maxWidth: 420,
  },
}));
