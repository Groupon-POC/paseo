// Added for Groupon Desk (fork of Paseo, Apache-2.0): the "On <Mac>" picker of New workspace, from the hub's Macs.

/**
 * What New workspace's Mac picker shows: the person's Macs from the hub, the one the workspace and
 * its agent start on. Pure, so it is tested without React.
 *
 * Responsibilities:
 * - one option per Mac, keyed by its daemon's server id (and the hub's machine id), named by the
 *   hub's alias or name, never by the label Paseo's host registry stored for that daemon; this Mac
 *   first, then Your Macs' order (connected first, the primary, the most recently seen)
 * - a registry host no hub Mac stands behind (an earlier session's direct host): left out of a
 *   release build; listed last, marked "stored host", only in a development build
 * - which can be chosen: a connected Mac only (Your Macs' `connected`); every other Mac is listed
 *   greyed with a short reason ("hand not running", "connecting", "different vault")
 * - the Mac chosen by default: this Mac when it is connected, else Paseo's own choice
 * - the tools a Mac's hand cannot find, as amber labels (`missing-tools-model.ts`)
 * - the green "This computer" label on this Mac only, apart from the grey caption (`badge`)
 * - the trigger's text, "On <Mac>"
 *
 * Constraints:
 * - Choosing a Mac switches New workspace's host (Paseo's host selection), so the repository list,
 *   Local / Worktree and the started task all belong to that Mac; nothing here starts a daemon
 */

import type { HubMachineView } from "./hub-sync";
import { shownMissingTools } from "./missing-tools-model";
import { GROUPON_MAC_PICKER, GROUPON_THIS_COMPUTER, type MissingTool } from "./strings";
import { yourMacRows, type YourMacState } from "./your-macs-model";

/** Your Macs' state of the Mac, or `stored` for a registry host no hub Mac stands behind. */
export type MacPickerState = YourMacState | "stored";

export interface MacPickerOption {
  /** The hub's machine id (unique even for a Mac whose host was never added); `stored:<server id>` for a stored host. */
  id: string;
  label: string;
  /** The host to switch to; null for a Mac that cannot be chosen now. */
  serverId: string | null;
  /** The Mac's daemon, chosen or not: what ties Paseo's projects on that host to this Mac. */
  hostServerId: string | null;
  /** Every hub record that stands for this Mac: what ties the hub's checkouts to it. */
  machineIds: string[];
  isThisMac: boolean;
  state: MacPickerState;
  selectable: boolean;
  /** The grey caption under the name: why the Mac cannot be chosen; null otherwise. */
  note: string | null;
  /** The green label after the name, "This computer", on this Mac only; null on every other. */
  badge: string | null;
  /** The tools its hand cannot find, as small amber labels ("gh missing"); `codex` only while a session on the Mac uses it. */
  missingTools: MissingTool[];
}

const NOTE_BY_STATE: Record<Exclude<YourMacState, "connected">, string> = {
  connecting: GROUPON_MAC_PICKER.connecting,
  noHand: GROUPON_MAC_PICKER.noHand,
  otherVault: GROUPON_MAC_PICKER.otherVault,
  failed: GROUPON_MAC_PICKER.failed,
};

/** The green label of the computer the window runs on; null for any other Mac. */
export function thisComputerBadge(isThisMac: boolean): string | null {
  return isThisMac ? GROUPON_THIS_COMPUTER : null;
}

/** The green label for a host (Start a ticket names one by server id) when it is this Mac's daemon. */
export function thisComputerBadgeForHost(
  views: readonly HubMachineView[],
  serverId: string,
): string | null {
  return thisComputerBadge(views.some((view) => view.thisMac && view.serverId === serverId));
}

/** A host in Paseo's registry: its server id and the label the registry keeps for it. */
export interface RegistryHost {
  serverId: string;
  label: string;
}

const NO_SERVER_IDS: ReadonlySet<string> = new Set();

export function macPickerOptions(
  views: readonly HubMachineView[],
  isOnline: (serverId: string) => boolean,
  registryHosts: readonly RegistryHost[] = [],
  includeStoredHosts = false,
  /** The daemons a session using Codex runs on: `codex` is shown missing on those only. */
  codexServerIds: ReadonlySet<string> = NO_SERVER_IDS,
): MacPickerOption[] {
  const rows = yourMacRows(views, isOnline);
  const serverIdOfMachine = new Map(views.map((view) => [view.machine.machine, view.serverId]));
  const reportedToolsOf = new Map(
    views.map((view) => [view.machine.machine, view.machine.missingTools]),
  );
  const machinesOf = (machineId: string, serverId: string | null): string[] =>
    serverId === null
      ? [machineId]
      : views.filter((view) => view.serverId === serverId).map((view) => view.machine.machine);
  const ordered = [...rows.filter((row) => row.isThisMac), ...rows.filter((row) => !row.isThisMac)];
  const macs = ordered.map((row): MacPickerOption => {
    const selectable = row.state === "connected" && row.openServerId !== null;
    const reason = row.state === "connected" ? null : NOTE_BY_STATE[row.state];
    const hostServerId = serverIdOfMachine.get(row.id) ?? null;
    return {
      id: row.id,
      label: row.label,
      serverId: selectable ? row.openServerId : null,
      hostServerId,
      machineIds: machinesOf(row.id, hostServerId),
      isThisMac: row.isThisMac,
      state: row.state,
      selectable,
      note: reason,
      badge: thisComputerBadge(row.isThisMac),
      missingTools: shownMissingTools(
        reportedToolsOf.get(row.id),
        hostServerId !== null && codexServerIds.has(hostServerId),
      ),
    };
  });
  if (!includeStoredHosts) return macs;
  // Every daemon a hub record names, chosen or not, so a stored host never repeats a hub Mac.
  const onHub = new Set(views.flatMap((view) => (view.serverId ? [view.serverId] : [])));
  const stored = registryHosts
    .filter((host) => !onHub.has(host.serverId))
    .map(
      (host): MacPickerOption => ({
        id: `stored:${host.serverId}`,
        label: host.label,
        serverId: isOnline(host.serverId) ? host.serverId : null,
        hostServerId: host.serverId,
        machineIds: [],
        isThisMac: false,
        state: "stored",
        selectable: isOnline(host.serverId),
        note: GROUPON_MAC_PICKER.storedHost,
        badge: null,
        missingTools: [],
      }),
    );
  return [...macs, ...stored];
}

/** This Mac when it can be chosen; otherwise Paseo's own default stays. */
export function defaultMacServerId(
  options: readonly MacPickerOption[],
  paseoDefault: string,
): string {
  const thisMac = options.find((option) => option.isThisMac && option.selectable);
  return thisMac?.serverId ?? paseoDefault;
}

/** "On <Mac>" for the chosen host, named as the picker names it, never by the registry's label. */
export function macPickerTriggerLabel(
  options: readonly MacPickerOption[],
  selectedServerId: string,
): string {
  const chosen = options.find((option) => option.serverId === selectedServerId);
  return GROUPON_MAC_PICKER.on(chosen?.label ?? GROUPON_MAC_PICKER.unknownMac);
}

/** The green "This computer" after the "On <Mac>" text when the chosen host is this Mac; else null. */
export function macPickerTriggerBadge(
  options: readonly MacPickerOption[],
  selectedServerId: string,
): string | null {
  return options.find((option) => option.serverId === selectedServerId)?.badge ?? null;
}
