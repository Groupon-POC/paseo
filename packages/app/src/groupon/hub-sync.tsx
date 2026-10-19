// Added for Groupon Desk (fork of Paseo, Apache-2.0): every Mac on the hub becomes a Paseo host, through the hand's door or through Core; this Mac's connects directly.

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
 */

import { useEffect } from "react";
import { create } from "zustand";
import { getHostRuntimeStore, useHostRegistryStatus } from "@/runtime/host-runtime";
import { coreRelayEndpoint } from "./core-relay";
import { openSealedText } from "./crypto";
import { fetchMachines, machineLabel, PAIRING_OFFER_KIND, type HubMachine } from "./hub";
import { localListenFor, readLocalDaemons, type LocalDaemon } from "./local-daemon";
import { useGrouponStore } from "./session";

export type HubMachineState = "added" | "noOffer" | "sealedElsewhere" | "failed";

export interface HubMachineView {
  machine: HubMachine;
  label: string;
  state: HubMachineState;
  serverId: string | null;
  /** The daemon's own address when it runs on this Mac and is reached directly; null otherwise. */
  direct: string | null;
  /** The relay the host was added through: the hand's door, or Core's address; null when not added. */
  relay: string | null;
  error: string | null;
}

interface HubMachinesState {
  machines: HubMachineView[];
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
): Promise<HubMachineView> {
  const label = machineLabel(machine);
  const base = { machine, label, serverId: null, direct: null, relay: null, error: null };
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
  syncing: false,
  lastSyncAt: null,
  error: null,
  sync: async () => {
    const { sealKey, coreUrl } = useGrouponStore.getState();
    if (!sealKey || get().syncing) return;
    set({ syncing: true, error: null });
    try {
      const [{ machines }, localDaemons] = await Promise.all([fetchMachines(), readLocalDaemons()]);
      const viaCore = relayForDevice(localDaemons, coreUrl);
      const views: HubMachineView[] = [];
      for (const machine of machines) {
        views.push(await addMachine(machine, sealKey, localDaemons, viaCore));
      }
      set({ machines: views, lastSyncAt: new Date().toISOString() });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ syncing: false });
    }
  },
}));

/** Mounted once behind the gate: syncs when the host registry has loaded. */
export function GrouponHubSync() {
  const registryStatus = useHostRegistryStatus();
  const sync = useHubMachinesStore((state) => state.sync);
  useEffect(() => {
    if (registryStatus === "ready") void sync();
  }, [registryStatus, sync]);
  return null;
}
