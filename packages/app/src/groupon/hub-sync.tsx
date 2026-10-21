// Added for Groupon Desk (fork of Paseo, Apache-2.0): every Mac on the hub becomes a Paseo host, through the hand's door or through Core; this Mac's connects directly; the list stays current while the window is open.

/**
 * After sign-in, the person's Macs come from the hub (`GET /user/groupon_desk/machines`). Each Mac
 * whose hand registered a Paseo pairing offer carries it sealed under the person's relay key; it
 * is opened here with the seal key and added as a Paseo host over Core's relay, so Paseo's own
 * workspace and agent screens work against that Mac. A Mac whose offer does not open (another
 * vault) or that has none is listed, not added.
 *
 * Which way the relay is reached depends on the device:
 * - a desktop app on a Mac that runs the hand: through that hand's door, the address the offer
 *   names (`127.0.0.1:<6771 + 100 x slot>`), and its own Mac also directly (`local-daemon.ts`),
 *   which Paseo prefers; the relay stays its fallback
 * - anything else (the web build on a phone or a laptop, a desktop app on a Mac without a hand):
 *   straight to Core, whose address replaces the door's (`core-relay.ts`, the phone's path); the
 *   daemon's key in the offer, and so the end-to-end seal, is the same either way
 *
 * The list stays current while the window is open (`GrouponHubSync`, `createHubResync`): a Mac
 * that signs in, or whose hand starts or stops, after the window opened shows up without a
 * restart. The hub is read again
 * - every 30 s while the window is in the foreground (`HUB_RESYNC_MS`), paused while it is hidden:
 *   the hub has no push to the window, so this is what bounds how late a new Mac appears; one
 *   GET of `/user/groupon_desk/machines` per open window every 30 s is a small, flat load on Core,
 *   and half a minute is soon enough for a Mac somebody just signed in on
 * - at once when the window becomes visible again or regains focus
 * - when Paseo's runtime sees a hub Mac's connection go online or drop (Core's relay closes the
 *   socket when the daemon leaves, and the client reconnects when it is back): the cheap signal
 *   the app already has, for a Mac it already knows; a Mac it does not know yet waits for the
 *   interval
 * - while a chooser of Macs shows this Mac greyed and this Mac's daemon has started meanwhile
 *   (`add-to-mac-model.ts`' `shouldResyncForThisMac`), so the row enables without waiting
 * An event-driven read follows the previous one by at least 5 s, and two reads never overlap. A
 * read that fails keeps the last list and its error line until a read succeeds.
 *
 * Every read also asks the desktop app which hub Mac it runs on (`readThisMachineId`), so this Mac
 * is named and listed first even while its hand, and so its daemon, is not running.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { create } from "zustand";
import { useAppActivelyVisible, useAppVisible } from "@/hooks/use-app-visible";
import {
  getHostRuntimeStore,
  isHostRuntimeConnected,
  useHostRegistryStatus,
} from "@/runtime/host-runtime";
import { coreRelayEndpoint } from "./core-relay";
import { openSealedText } from "./crypto";
import { fetchMachines, machineLabel, PAIRING_OFFER_KIND, type HubMachine } from "./hub";
import {
  localListenFor,
  readLocalDaemons,
  readThisMachineId,
  type LocalDaemon,
} from "./local-daemon";
import { useGrouponStore } from "./session";

export type HubMachineState = "added" | "noOffer" | "sealedElsewhere" | "failed";

export interface HubMachineView {
  machine: HubMachine;
  label: string;
  state: HubMachineState;
  serverId: string | null;
  /** The daemon's own address when it runs on this Mac and is reached directly; null otherwise. */
  direct: string | null;
  /** The Mac the window runs on: Groupon Desk's id for it, or its daemon answering directly. */
  thisMac: boolean;
  /** The relay the host was added through: the hand's door, or Core's address; null when not added. */
  relay: string | null;
  error: string | null;
}

interface HubMachinesState {
  machines: HubMachineView[];
  /** This Mac's hub id (Groupon Desk's own), known even while its hand is not running; null off the desktop app. */
  thisMachineId: string | null;
  syncing: boolean;
  lastSyncAt: string | null;
  error: string | null;
  sync: () => Promise<void>;
}

/** The serverId inside an offer URL (`#offer=<base64url JSON>`), for the list; null if unreadable. */
function serverIdOf(offerUrl: string): string | null {
  const marker = offerUrl.indexOf("#offer=");
  if (marker < 0) return null;
  try {
    const b64 = offerUrl
      .slice(marker + 7)
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const json = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="))) as {
      serverId?: unknown;
    };
    return typeof json.serverId === "string" ? json.serverId : null;
  } catch {
    return null;
  }
}

/**
 * The relay a device reaches the person's Macs through: the hand's door when this device runs a
 * hand (its desktop app sees a local daemon), else Groupon's Core itself; null keeps the offer's.
 */
export function relayForDevice(
  localDaemons: readonly LocalDaemon[],
  coreUrl: string,
): { endpoint: string; useTls: boolean } | null {
  return localDaemons.length > 0 ? null : coreRelayEndpoint(coreUrl);
}

export async function addMachine(
  machine: HubMachine,
  sealKey: Uint8Array,
  localDaemons: readonly LocalDaemon[] = [],
  viaCore: { endpoint: string; useTls: boolean } | null = null,
  thisMachineId: string | null = null,
): Promise<HubMachineView> {
  const label = machineLabel(machine);
  const thisMac = thisMachineId !== null && machine.machine === thisMachineId;
  const base = { machine, label, serverId: null, direct: null, thisMac, relay: null, error: null };
  if (!machine.relayOfferSealed) return { ...base, state: "noOffer" };
  const offerUrl = openSealedText(
    machine.relayOfferSealed,
    machine.machine,
    PAIRING_OFFER_KIND,
    sealKey,
  );
  if (offerUrl === null) return { ...base, state: "sealedElsewhere" };
  try {
    const store = getHostRuntimeStore();
    const profile = viaCore
      ? await store.upsertTrustedOffer(offerUrl, label, viaCore)
      : await store.upsertTrustedOffer(offerUrl, label);
    const relay = profile.connections.find((connection) => connection.type === "relay");
    const direct = localListenFor(localDaemons, profile.serverId);
    if (direct) {
      await store.upsertConnectionFromListen({
        listenAddress: direct,
        serverId: profile.serverId,
        hostname: label,
      });
    }
    return {
      ...base,
      state: "added",
      serverId: profile.serverId,
      direct,
      thisMac: thisMac || direct !== null,
      relay: viaCore?.endpoint ?? (relay?.type === "relay" ? relay.relayEndpoint : null),
    };
  } catch (error) {
    return {
      ...base,
      state: "failed",
      serverId: serverIdOf(offerUrl),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const useHubMachinesStore = create<HubMachinesState>((set, get) => ({
  machines: [],
  thisMachineId: null,
  syncing: false,
  lastSyncAt: null,
  error: null,
  sync: async () => {
    const { sealKey, coreUrl } = useGrouponStore.getState();
    if (!sealKey || get().syncing) return;
    // The error line stays until a read succeeds, so a failing retry does not blink it away.
    set({ syncing: true });
    try {
      const [{ machines }, localDaemons, thisMachineId] = await Promise.all([
        fetchMachines(),
        readLocalDaemons(),
        readThisMachineId(),
      ]);
      const viaCore = relayForDevice(localDaemons, coreUrl);
      const views: HubMachineView[] = [];
      for (const machine of machines) {
        views.push(await addMachine(machine, sealKey, localDaemons, viaCore, thisMachineId));
      }
      set({
        machines: views,
        thisMachineId,
        lastSyncAt: new Date().toISOString(),
        error: null,
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ syncing: false });
    }
  },
}));

/** How often the hub is read again while the window is in the foreground (header: why 30 s). */
export const HUB_RESYNC_MS = 30_000;
/** The least time between two reads started by an event (focus, visibility, the relay). */
export const HUB_EVENT_RESYNC_GAP_MS = 5_000;

export interface HubResync {
  /** Read now, foreground or not, unless a read is in flight (the first read after sign-in). */
  syncNow(): void;
  /** The window entered or left the foreground: the interval runs only while it is in it. */
  setForeground(foreground: boolean): void;
  /** Something suggests the list moved (focus, a hub Mac's connection): read if in foreground. */
  nudge(): void;
  stop(): void;
}

/**
 * The schedule of hub reads, without React: an interval while in the foreground, a read on
 * entering it and on a nudge, at least `gapMs` after the previous read for anything event-driven,
 * and never a second read while one is in flight.
 */
export function createHubResync({
  sync,
  intervalMs = HUB_RESYNC_MS,
  gapMs = HUB_EVENT_RESYNC_GAP_MS,
  now = Date.now,
}: {
  sync: () => Promise<void>;
  intervalMs?: number;
  gapMs?: number;
  now?: () => number;
}): HubResync {
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight = false;
  let lastStartedAt = Number.NEGATIVE_INFINITY;

  const run = () => {
    if (inFlight) return;
    inFlight = true;
    lastStartedAt = now();
    void sync()
      .catch(() => undefined)
      .finally(() => {
        inFlight = false;
      });
  };
  const runIfDue = () => {
    if (now() - lastStartedAt >= gapMs) run();
  };
  const stop = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  return {
    syncNow: run,
    setForeground(foreground) {
      if (!foreground) {
        stop();
        return;
      }
      if (timer !== null) return;
      timer = setInterval(run, intervalMs);
      runIfDue();
    },
    nudge() {
      if (timer !== null) runIfDue();
    },
    stop,
  };
}

/**
 * The hub Macs Paseo's runtime has online right now, as one sorted string (a stable snapshot):
 * it changes when one of them connects or drops, the relay signal `GrouponHubSync` reads.
 */
export function useOnlineServerIds(serverIds: readonly string[]): string {
  const runtime = getHostRuntimeStore();
  const read = useCallback(
    () =>
      serverIds
        .filter((serverId) => isHostRuntimeConnected(runtime.getSnapshot(serverId)))
        .sort()
        .join(","),
    [runtime, serverIds],
  );
  return useSyncExternalStore((onChange) => runtime.subscribeAll(onChange), read, read);
}

const EMPTY_SERVER_IDS: readonly string[] = [];

function hubServerIds(machines: readonly HubMachineView[]): readonly string[] {
  const ids = machines.flatMap((view) => (view.serverId ? [view.serverId] : []));
  return ids.length > 0 ? ids : EMPTY_SERVER_IDS;
}

/**
 * Mounted once behind the gate: reads the hub once the host registry has loaded, then keeps the
 * list current while the window is open (the schedule in this file's header).
 */
export function GrouponHubSync() {
  const ready = useHostRegistryStatus() === "ready";
  const visible = useAppVisible();
  const focused = useAppActivelyVisible();
  const machines = useHubMachinesStore((state) => state.machines);
  const [serverIds, setServerIds] = useState(EMPTY_SERVER_IDS);
  const online = useOnlineServerIds(serverIds);
  const [resync] = useState(() =>
    createHubResync({ sync: () => useHubMachinesStore.getState().sync() }),
  );

  // Only a change in which Macs the hub names re-subscribes the relay signal, not every read.
  useEffect(() => {
    const next = hubServerIds(machines);
    setServerIds((current) => (current.join(",") === next.join(",") ? current : next));
  }, [machines]);

  useEffect(() => () => resync.stop(), [resync]);
  useEffect(() => {
    if (ready) resync.syncNow();
  }, [ready, resync]);
  useEffect(() => {
    if (ready) resync.setForeground(visible);
  }, [ready, visible, resync]);
  useEffect(() => {
    if (ready && focused) resync.nudge();
  }, [ready, focused, resync]);
  useEffect(() => {
    if (ready) resync.nudge();
  }, [ready, online, resync]);
  return null;
}
