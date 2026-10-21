// Added for Groupon Desk (fork of Paseo, Apache-2.0): which Macs Add project and From GitHub offer, this Mac first, and why one cannot be chosen.

/**
 * The model of every chooser of the Mac a project is added to: Add project's first page (Paseo's
 * "Choose host"), the host step of From GitHub, and so Search for directory and New directory,
 * which follow the Mac chosen there. Pure, so it is tested without React.
 *
 * The owner's complaint of 2026-10-21: on a Mac whose hand was not running, Add project went
 * straight to the one Mac that was serving, and there was no way to add the project on the Mac he
 * sat at. Hence:
 *
 * Responsibilities:
 * - `addToMacRows`: one row per Mac from the hub, this Mac first, always, named by the hub; a Mac
 *   that cannot take the project now is greyed with the reason; this Mac without its hand says so
 *   in one sentence with the way out and the command to copy; a desktop window whose Mac the hub
 *   does not list yet still shows a "This Mac" row, greyed
 * - `addToMacStart` / `openAddToMacFlow`: where the chooser opens: the method page of the Mac the
 *   caller named, else of this Mac when it is serving, with the list of Macs one Back away; From
 *   GitHub always on the list; never on another Mac merely because it is the only one serving
 * - `shouldResyncForThisMac`: when this Mac's row is greyed but its daemon answers on loopback
 *   (the hand just started), the hub is read again so the row enables without a restart
 * - `macsHoldingRepository`: which Macs already hold a GitHub repository, and where, for From
 *   GitHub's folder step
 *
 * Constraints:
 * - Never hide this Mac: a greyed row is the answer, not an absent one
 * - Only a Mac whose host is online and can add a project is selectable
 */

import {
  chooseAddProjectHost,
  openAddProjectFlow,
  type AddProjectFlowState,
  type AddProjectHost,
} from "@/add-project-flow/model";
import type { HubCheckout, HubRepository } from "./hub";
import type { MacPickerOption, MacPickerState } from "./mac-picker-model";
import { normaliseRemote } from "./repository-picker-model";
import { GROUPON_ADD_TO_MAC, GROUPON_MAC_PICKER } from "./strings";

/** Add project's own chooser, or From GitHub's host step. */
export type AddToMacIntent = "project" | "github";

export interface AddToMacRow {
  /** The hub's machine id; `this-mac:<id>` for this Mac when the hub does not list it. */
  id: string;
  /** The hub's name for the Mac ("This Mac" when the hub does not list it). */
  label: string;
  /** The host to add to; null while the Mac cannot be chosen. */
  serverId: string | null;
  isThisMac: boolean;
  selectable: boolean;
  /** The short line under the name: "This Mac", "hand not running", "This Mac · connecting". */
  note: string | null;
  /** This Mac without its hand: the sentence with the way out; null otherwise. */
  reason: string | null;
  /** The command the reason names, for its Copy button; null otherwise. */
  command: string | null;
}

const NOTE_BY_STATE: Record<Exclude<MacPickerState, "connected">, string> = {
  connecting: GROUPON_MAC_PICKER.connecting,
  noHand: GROUPON_MAC_PICKER.noHand,
  otherVault: GROUPON_MAC_PICKER.otherVault,
  failed: GROUPON_MAC_PICKER.failed,
  stored: GROUPON_MAC_PICKER.storedHost,
};

/** Why a Mac cannot be chosen; a stored host is always marked as one; null for a Mac that can. */
function reasonOf(mac: MacPickerOption, selectable: boolean): string | null {
  if (mac.state === "stored") return GROUPON_MAC_PICKER.storedHost;
  if (selectable) return null;
  // Online by the hub but not yet a host Add project can use: still coming up.
  if (mac.state === "connected") return GROUPON_MAC_PICKER.connecting;
  return NOTE_BY_STATE[mac.state];
}

function noteOf(mac: MacPickerOption, selectable: boolean): string | null {
  const reason = reasonOf(mac, selectable);
  if (!mac.isThisMac) return reason;
  return reason ? GROUPON_ADD_TO_MAC.thisMacWith(reason) : GROUPON_ADD_TO_MAC.thisMac;
}

function thisMacWithoutHand(id: string, label: string): AddToMacRow {
  return {
    id,
    label,
    serverId: null,
    isThisMac: true,
    selectable: false,
    note: GROUPON_ADD_TO_MAC.thisMacWith(GROUPON_MAC_PICKER.noHand),
    reason: GROUPON_ADD_TO_MAC.noHandHere,
    command: GROUPON_ADD_TO_MAC.noHandCommand,
  };
}

export interface AddToMacRowsInput {
  /** The Mac picker's options (`macPickerOptions`): this Mac first, then Your Macs' order. */
  macs: readonly MacPickerOption[];
  /** Whether Add project can use this host now: online, as Paseo's flow lists hosts. */
  canAddTo: (serverId: string) => boolean;
  /** This Mac's hub id from the desktop app; null outside it. */
  thisMachineId: string | null;
}

export function addToMacRows(input: AddToMacRowsInput): AddToMacRow[] {
  const rows = input.macs.map((mac): AddToMacRow => {
    const selectable = mac.selectable && mac.serverId !== null && input.canAddTo(mac.serverId);
    if (mac.isThisMac && mac.state === "noHand") return thisMacWithoutHand(mac.id, mac.label);
    return {
      id: mac.id,
      label: mac.label,
      serverId: selectable ? mac.serverId : null,
      isThisMac: mac.isThisMac,
      selectable,
      note: noteOf(mac, selectable),
      reason: null,
      command: null,
    };
  });
  const listed =
    input.thisMachineId === null ||
    input.macs.some((mac) => mac.isThisMac || mac.machineIds.includes(input.thisMachineId ?? ""));
  if (listed) return rows;
  // The desktop window knows which Mac it is, the hub does not list it yet: its hand never ran.
  return [
    thisMacWithoutHand(`this-mac:${input.thisMachineId}`, GROUPON_ADD_TO_MAC.thisMac),
    ...rows,
  ];
}

/** The row Enter picks when the chooser opens: the first that can be chosen (this Mac when it can). */
export function firstSelectableRow(rows: readonly { disabled?: boolean }[]): number {
  const index = rows.findIndex((row) => row.disabled !== true);
  return index < 0 ? 0 : index;
}

export interface AddToMacStartInput {
  rows: readonly AddToMacRow[];
  intent: AddToMacIntent;
  /** The Mac the caller named (New workspace's chosen Mac, a project's host). */
  preferredHostId?: string;
}

/**
 * The Mac whose methods the chooser opens on; null opens it on the list of Macs. From GitHub's
 * host step is always shown. Only in a window that is on no Mac (the web build) does the one
 * serving Mac stand in for this Mac.
 */
export function addToMacStart(input: AddToMacStartInput): string | null {
  if (input.intent === "github") return null;
  const selectable = input.rows.filter((row) => row.selectable && row.serverId !== null);
  const preferred = selectable.find((row) => row.serverId === input.preferredHostId);
  if (preferred) return preferred.serverId;
  const thisMac = input.rows.find((row) => row.isThisMac);
  if (thisMac) return thisMac.selectable ? thisMac.serverId : null;
  return selectable.length === 1 ? (selectable[0]?.serverId ?? null) : null;
}

/** Paseo's flow state, opened on the list of Macs, with the start Mac's methods on top of it. */
export function openAddToMacFlow(
  hosts: AddProjectHost[],
  startHostId: string | null,
): AddProjectFlowState {
  const list = { ...openAddProjectFlow({ hosts: [] }), hosts };
  return startHostId && hosts.some((host) => host.serverId === startHostId)
    ? chooseAddProjectHost(list, startHostId)
    : list;
}

/**
 * Read the hub again: this Mac is listed greyed while a daemon answers on this Mac (its hand
 * started since the last read), so the next read adds it and the row enables.
 */
export function shouldResyncForThisMac(
  rows: readonly AddToMacRow[],
  localDaemonCount: number,
): boolean {
  const thisMac = rows.find((row) => row.isThisMac);
  return thisMac !== undefined && !thisMac.selectable && localDaemonCount > 0;
}

/** A hub Mac, as the window names it: what `macsHoldingRepository` needs of the hub views. */
export interface NamedMac {
  machineId: string;
  label: string;
  serverId: string | null;
  isThisMac: boolean;
}

export interface MacHolding {
  label: string;
  path: string;
  /** The Mac From GitHub is cloning to. */
  isChosen: boolean;
}

/**
 * The Macs that already hold `<githubHost>/<fullName>`, as their hands report checkouts to the hub:
 * the Mac being cloned to first, then this Mac, then the rest; one line per Mac.
 */
export function macsHoldingRepository(input: {
  repositories: readonly HubRepository[];
  checkouts: readonly HubCheckout[];
  macs: readonly NamedMac[];
  githubHost: string;
  fullName: string;
  chosenServerId: string;
}): MacHolding[] {
  const wanted = normaliseRemote(`${input.githubHost}/${input.fullName}`);
  if (wanted === null) return [];
  const repositoryIds = new Set(
    input.repositories
      .filter((repository) => normaliseRemote(repository.remoteUrl) === wanted)
      .map((repository) => repository.id),
  );
  const seen = new Set<string>();
  const holdings: (MacHolding & { isThisMac: boolean })[] = [];
  for (const checkout of input.checkouts) {
    if (!repositoryIds.has(checkout.repositoryId)) continue;
    const mac = input.macs.find((candidate) => candidate.machineId === checkout.machine);
    if (!mac || seen.has(mac.label)) continue;
    seen.add(mac.label);
    holdings.push({
      label: mac.label,
      path: checkout.rootPath,
      isChosen: mac.serverId !== null && mac.serverId === input.chosenServerId,
      isThisMac: mac.isThisMac,
    });
  }
  holdings.sort(
    (a, b) => Number(b.isChosen) - Number(a.isChosen) || Number(b.isThisMac) - Number(a.isThisMac),
  );
  return holdings.map(({ label, path, isChosen }) => ({ label, path, isChosen }));
}
