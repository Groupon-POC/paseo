// Added for Groupon Desk (fork of Paseo, Apache-2.0): the "On <Mac>" picker of New workspace, from the hub's Macs.

/**
 * What New workspace's Mac picker shows: the person's Macs from the hub, the one the workspace and
 * its agent start on. Pure, so it is tested without React.
 *
 * Responsibilities:
 * - one option per hub Mac, this Mac first, then Your Macs' order (connected first, the primary,
 *   the most recently seen)
 * - which can be chosen: a connected Mac only (Your Macs' `connected`); every other Mac is listed
 *   greyed with a short reason ("hand not running", "connecting", "different vault")
 * - the Mac chosen by default: this Mac when it is connected, else Paseo's own choice
 * - the trigger's text, "On <Mac>"
 *
 * Constraints:
 * - Choosing a Mac switches New workspace's host (Paseo's host selection), so the repository list,
 *   Local / Worktree and the started task all belong to that Mac; nothing here starts a daemon
 */

import type { HubMachineView } from "./hub-sync";
import { GROUPON_MAC_PICKER } from "./strings";
import { yourMacRows, type YourMacState } from "./your-macs-model";

export interface MacPickerOption {
  /** The hub's machine id: unique even for a Mac whose host was never added. */
  id: string;
  label: string;
  /** The host to switch to; null for a Mac that cannot be chosen now. */
  serverId: string | null;
  isThisMac: boolean;
  selectable: boolean;
  /** The greyed reason under a Mac that cannot be chosen, or "This Mac"; null otherwise. */
  note: string | null;
}

const NOTE_BY_STATE: Record<Exclude<YourMacState, "connected">, string> = {
  connecting: GROUPON_MAC_PICKER.connecting,
  noHand: GROUPON_MAC_PICKER.noHand,
  otherVault: GROUPON_MAC_PICKER.otherVault,
  failed: GROUPON_MAC_PICKER.failed,
};

export function macPickerOptions(
  views: readonly HubMachineView[],
  isOnline: (serverId: string) => boolean,
): MacPickerOption[] {
  const rows = yourMacRows(views, isOnline);
  const ordered = [...rows.filter((row) => row.isThisMac), ...rows.filter((row) => !row.isThisMac)];
  return ordered.map((row) => {
    const selectable = row.state === "connected" && row.openServerId !== null;
    const reason = row.state === "connected" ? null : NOTE_BY_STATE[row.state];
    return {
      id: row.id,
      label: row.label,
      serverId: selectable ? row.openServerId : null,
      isThisMac: row.isThisMac,
      selectable,
      note: reason ?? (row.isThisMac ? GROUPON_MAC_PICKER.thisMac : null),
    };
  });
}

/** This Mac when it can be chosen; otherwise Paseo's own default stays. */
export function defaultMacServerId(
  options: readonly MacPickerOption[],
  paseoDefault: string,
): string {
  const thisMac = options.find((option) => option.isThisMac && option.selectable);
  return thisMac?.serverId ?? paseoDefault;
}

/** "On <Mac>" for the chosen host; the host's own label when it is no hub Mac. */
export function macPickerTriggerLabel(
  options: readonly MacPickerOption[],
  selectedServerId: string,
  hostLabel: string | null,
): string {
  const chosen = options.find((option) => option.serverId === selectedServerId);
  return GROUPON_MAC_PICKER.on(chosen?.label ?? hostLabel ?? "a Mac");
}
