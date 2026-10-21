// Added for Groupon Desk (fork of Paseo, Apache-2.0): the rows of Add project's and From GitHub's Mac chooser, this Mac first, and what makes this Mac's row enable itself.

/**
 * The React side of `add-to-mac-model.ts`: the person's Macs as Add project's first page and From
 * GitHub's host step list them, the sentence and Copy button under this Mac when its hand is not
 * running, the one-line hint under From GitHub's rows, and the Macs that already hold a repository
 * on From GitHub's folder step.
 *
 * Constraints:
 * - The rows follow the hub store and Paseo's connection statuses, so a Mac whose hand starts
 *   while the chooser is open enables without a restart (the hub sync's 30 s read, or at once
 *   when this Mac's daemon answers: `useThisMacHandWatch`)
 */

import { useEffect, useMemo } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { AddProjectHost } from "@/add-project-flow/model";
import type { HostRuntimeConnectionStatus } from "@/runtime/host-runtime";
import type { HostProfile } from "@/types/host-connection";
import {
  addToMacRows,
  macsHoldingRepository,
  shouldResyncForThisMac,
  type AddToMacRow,
  type MacHolding,
} from "./add-to-mac-model";
import { CopyLine } from "./copy-line";
import { useHubMachinesStore } from "./hub-sync";
import { readLocalDaemons } from "./local-daemon";
import { macPickerOptions } from "./mac-picker-model";
import { useHubCheckouts } from "./repository-picker";
import { GROUPON_ADD_TO_MAC } from "./strings";

/** How often this Mac's loopback is asked for a daemon while its row is greyed on screen. */
const THIS_MAC_WATCH_MS = 5_000;

export function useAddToMacRows(input: {
  hosts: readonly HostProfile[];
  connectionStatuses: ReadonlyMap<string, HostRuntimeConnectionStatus>;
  availableHosts: readonly AddProjectHost[];
}): AddToMacRow[] {
  const { hosts, connectionStatuses, availableHosts } = input;
  const hubMachines = useHubMachinesStore((state) => state.machines);
  const thisMachineId = useHubMachinesStore((state) => state.thisMachineId);
  return useMemo(() => {
    const available = new Set(availableHosts.map((host) => host.serverId));
    // A registry host no hub Mac stands behind is listed only in a development build.
    const macs = macPickerOptions(
      hubMachines,
      (id) => connectionStatuses.get(id) === "online",
      hosts,
      __DEV__,
    );
    return addToMacRows({ macs, canAddTo: (id) => available.has(id), thisMachineId });
  }, [availableHosts, connectionStatuses, hosts, hubMachines, thisMachineId]);
}

/**
 * While `active` (a chooser on screen) and this Mac's row is greyed, asks this Mac's loopback for
 * a daemon every 5 s and reads the hub again once one answers; the hub sync's own 30 s read is
 * the fallback.
 */
export function useThisMacHandWatch(rows: readonly AddToMacRow[], active: boolean): void {
  const thisMacGreyed = rows.some((row) => row.isThisMac && !row.selectable);
  useEffect(() => {
    if (!active || !thisMacGreyed) return;
    let live = true;
    const check = async () => {
      const daemons = await readLocalDaemons();
      if (live && shouldResyncForThisMac(rows, daemons.length)) {
        await useHubMachinesStore.getState().sync();
      }
    };
    const timer = setInterval(() => void check(), THIS_MAC_WATCH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [active, rows, thisMacGreyed]);
}

/** The Macs that already hold a GitHub repository and where, as their hands report it to the hub. */
export function useMacsHoldingRepository(
  githubHost: string,
  fullName: string,
  chosenServerId: string,
): MacHolding[] {
  const { repositories, checkouts } = useHubCheckouts();
  const views = useHubMachinesStore((state) => state.machines);
  return useMemo(
    () =>
      macsHoldingRepository({
        repositories,
        checkouts,
        macs: views.map((view) => ({
          machineId: view.machine.machine,
          label: view.label,
          serverId: view.serverId,
          isThisMac: view.thisMac,
        })),
        githubHost,
        fullName,
        chosenServerId,
      }),
    [checkouts, chosenServerId, fullName, githubHost, repositories, views],
  );
}

/** Under From GitHub's folder: each Mac that already has the repository, with its path. */
export function MacsHoldingRepository({ holdings }: { holdings: readonly MacHolding[] }) {
  if (holdings.length === 0) return null;
  return (
    <View testID="groupon-github-holdings">
      {holdings.map((holding) => (
        <Text key={holding.label} style={holding.isChosen ? styles.holdingChosen : styles.holding}>
          {GROUPON_ADD_TO_MAC.hasItAt(holding.label, holding.path)}
        </Text>
      ))}
    </View>
  );
}

/** Under this Mac's greyed row: why, and the way out, with the command to copy. */
export function ThisMacHandReason({
  reason,
  command,
  testID,
}: {
  reason: string;
  command: string;
  testID: string;
}) {
  return (
    <View style={styles.reason} testID={testID}>
      <Text style={styles.reasonText}>{reason}</Text>
      <CopyLine
        text={command}
        accessibilityLabel={GROUPON_ADD_TO_MAC.noHandCommandLabel}
        testID={`${testID}-command`}
      />
    </View>
  );
}

/** Under From GitHub's host rows: where a repository goes, and how a Mac that has it shows. */
export function AddToMacGithubHint() {
  return (
    <Text style={styles.hint} testID="add-project-flow-github-hint">
      {GROUPON_ADD_TO_MAC.githubHint}
    </Text>
  );
}

const styles = StyleSheet.create((theme) => ({
  reason: {
    gap: theme.spacing[2],
    // Lined up with the row's text: the row's padding, its icon slot and the gap after it.
    paddingLeft: theme.spacing[4] + 18 + theme.spacing[3],
    paddingRight: theme.spacing[4],
    paddingBottom: theme.spacing[2],
  },
  reasonText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  holding: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  holdingChosen: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  hint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[1],
  },
}));
