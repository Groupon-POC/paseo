// Added for Groupon Desk (fork of Paseo, Apache-2.0): what the Your Macs screen shows, from the hub's Macs and the host runtime.

/**
 * The model of the Your Macs screen, the welcome screen of Groupon Desk's work window (Paseo's
 * Direct connection, Add host and pairing screens are gone: `PASEO_MANUAL_HOSTS`). Pure, so the
 * states are tested without React.
 *
 * Responsibilities:
 * - one row per Mac on the hub (`uniqueMacViews`: two hub records naming one daemon are one Mac),
 *   in the state a person acts on: connected, connecting (its hand is
 *   on Core's relay, or it is this Mac and its daemon answers directly), its hand not running,
 *   a different vault, or an error
 * - the screen as a whole: still loading, the hub unreadable, or the list with at most one notice
 *   above it: no Mac on the hub at all (the install instructions and the download), or Macs
 *   signed in but none serving (press Work window, or install the hand's service)
 * - "seen 5 min ago" from the hub's lastSeenAt, "updated 14:05" from the last read of the hub
 *
 * Constraints:
 * - Only a Mac whose host was added from the hub opens; nothing here offers an address to type
 * - A Mac is "on the relay" only while Core marks its daemon connected (`relayConnectedAt`): the
 *   session id and the sealed offer stay after the hand stops
 */

import type { HubMachineView } from "./hub-sync";
import { GROUPON_YOUR_MACS } from "./strings";

export type YourMacState = "connected" | "connecting" | "noHand" | "otherVault" | "failed";

export interface YourMacRow {
  id: string;
  label: string;
  model: string | null;
  isPrimary: boolean;
  /** This Mac: its daemon runs here and is reached directly. */
  isThisMac: boolean;
  lastSeenAt: string;
  state: YourMacState;
  /** The host to open on tap; null when the Mac cannot be opened now. */
  openServerId: string | null;
  /** The plain sentence under a Mac that cannot be opened; null for one that can. */
  message: string | null;
  /** A second, smaller line: the terminal command when the hand is not running. */
  hint: string | null;
}

/**
 * The one notice above the list. "install" only while the hub knows no Mac of the person at all
 * (the download link belongs there and nowhere else); "noneServing" while every Mac is signed in
 * but none runs its hand.
 */
export type YourMacsNotice = "install" | "noneServing" | null;

export type YourMacsModel =
  | { kind: "loading" }
  | { kind: "unreadable"; message: string }
  | { kind: "macs"; rows: YourMacRow[]; anyReachable: boolean; notice: YourMacsNotice };

export interface YourMacsInput {
  views: readonly HubMachineView[];
  /** Whether Paseo's runtime has this host online right now. */
  isOnline: (serverId: string) => boolean;
  syncing: boolean;
  lastSyncAt: string | null;
  error: string | null;
}

const STATE_ORDER: Record<YourMacState, number> = {
  connected: 0,
  connecting: 1,
  noHand: 2,
  otherVault: 3,
  failed: 4,
};

function rowOf(view: HubMachineView, isOnline: (serverId: string) => boolean): YourMacRow {
  const { machine } = view;
  const base = {
    id: machine.machine,
    label: view.label,
    model: machine.model,
    isPrimary: machine.isPrimary,
    isThisMac: view.direct !== null,
    lastSeenAt: machine.lastSeenAt,
    openServerId: null,
    message: null,
    hint: null,
  };
  if (view.state === "sealedElsewhere") {
    return { ...base, state: "otherVault", message: GROUPON_YOUR_MACS.otherVault };
  }
  if (view.state === "failed") {
    return {
      ...base,
      state: "failed",
      message: GROUPON_YOUR_MACS.failed(view.error ?? "unknown error"),
    };
  }
  const serverId = view.state === "added" ? view.serverId : null;
  if (serverId !== null && isOnline(serverId)) {
    return { ...base, state: "connected", openServerId: serverId };
  }
  if (serverId !== null && (view.direct !== null || machine.relayConnectedAt !== null)) {
    return { ...base, state: "connecting", openServerId: serverId };
  }
  return {
    ...base,
    state: "noHand",
    message: GROUPON_YOUR_MACS.noHand,
    hint: GROUPON_YOUR_MACS.noHandCommand,
  };
}

/** Connected first, then connecting; within a state the primary Mac, then the most recently seen. */
function compareRows(a: YourMacRow, b: YourMacRow): number {
  return (
    STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
    Number(b.isPrimary) - Number(a.isPrimary) ||
    b.lastSeenAt.localeCompare(a.lastSeenAt) ||
    a.label.localeCompare(b.label)
  );
}

/** How strongly a hub record stands for its daemon: added, then reached directly, then seen last. */
function compareViewsForOneDaemon(a: HubMachineView, b: HubMachineView): number {
  return (
    Number(b.state === "added") - Number(a.state === "added") ||
    Number(b.direct !== null) - Number(a.direct !== null) ||
    b.machine.lastSeenAt.localeCompare(a.machine.lastSeenAt)
  );
}

/**
 * One view per Mac: hub records that name the same daemon (server id) are one Mac, kept as the
 * record that stands for it best; a record without a server id is its own Mac (its machine id).
 */
export function uniqueMacViews(views: readonly HubMachineView[]): HubMachineView[] {
  const byKey = new Map<string, HubMachineView>();
  for (const view of views) {
    const key = view.serverId ? `server:${view.serverId}` : `machine:${view.machine.machine}`;
    const kept = byKey.get(key);
    if (!kept || compareViewsForOneDaemon(view, kept) < 0) byKey.set(key, view);
  }
  return [...byKey.values()];
}

/** One row per hub Mac, connected first (also New workspace's Mac picker, `mac-picker-model.ts`). */
export function yourMacRows(
  views: readonly HubMachineView[],
  isOnline: (serverId: string) => boolean,
): YourMacRow[] {
  return uniqueMacViews(views)
    .map((view) => rowOf(view, isOnline))
    .sort(compareRows);
}

function noticeOf(rows: readonly YourMacRow[]): YourMacsNotice {
  if (rows.length === 0) return "install";
  if (rows.every((row) => row.state === "noHand")) return "noneServing";
  return null;
}

export function yourMacsModel(input: YourMacsInput): YourMacsModel {
  if (input.lastSyncAt === null) {
    if (input.error !== null && !input.syncing) {
      return { kind: "unreadable", message: GROUPON_YOUR_MACS.loadFailed(input.error) };
    }
    return { kind: "loading" };
  }
  const rows = yourMacRows(input.views, input.isOnline);
  const anyReachable = rows.some((row) => row.openServerId !== null);
  return { kind: "macs", rows, anyReachable, notice: noticeOf(rows) };
}

/** The first connected Mac, the one the window goes straight to; null when none is. */
export function firstConnected(model: YourMacsModel): string | null {
  if (model.kind !== "macs") return null;
  return model.rows.find((row) => row.state === "connected")?.openServerId ?? null;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago"; the date itself past a week. */
export function seenAgo(lastSeenAt: string, now: Date): string {
  const at = new Date(lastSeenAt);
  const ms = now.getTime() - at.getTime();
  if (Number.isNaN(ms)) return lastSeenAt;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? "1 day ago" : `${days} days ago`;
  return `on ${at.toISOString().slice(0, 10)}`;
}

/** "updated 14:05", the local time of the last successful read of the hub; null before the first. */
export function updatedAt(lastSyncAt: string | null): string | null {
  if (lastSyncAt === null) return null;
  const at = new Date(lastSyncAt);
  if (Number.isNaN(at.getTime())) return null;
  const hhmm = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  return GROUPON_YOUR_MACS.updated(hhmm);
}
