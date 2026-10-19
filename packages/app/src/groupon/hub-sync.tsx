// Added for Groupon Desk (fork of Paseo, Apache-2.0): every Mac on the hub becomes a Paseo host.

/**
 * After sign-in, the person's Macs come from the hub (`GET /user/groupon_desk/machines`). Each Mac
 * whose hand registered a Paseo pairing offer carries it sealed under the person's relay key; it
 * is opened here with the seal key and added as a Paseo host over Core's relay, so Paseo's own
 * workspace and agent screens work against that Mac. A Mac whose offer does not open (another
 * vault) or that has none is listed, not added.
 */

import { useEffect } from "react";
import { create } from "zustand";
import { getHostRuntimeStore, useHostRegistryStatus } from "@/runtime/host-runtime";
import { openSealedText } from "./crypto";
import { fetchMachines, machineLabel, PAIRING_OFFER_KIND, type HubMachine } from "./hub";
import { useGrouponStore } from "./session";

export type HubMachineState = "added" | "noOffer" | "sealedElsewhere" | "failed";

export interface HubMachineView {
  machine: HubMachine;
  label: string;
  state: HubMachineState;
  serverId: string | null;
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

export async function addMachine(
  machine: HubMachine,
  sealKey: Uint8Array,
): Promise<HubMachineView> {
  const label = machineLabel(machine);
  const base = { machine, label, serverId: null, error: null };
  if (!machine.relayOfferSealed) return { ...base, state: "noOffer" };
  const offerUrl = openSealedText(
    machine.relayOfferSealed,
    machine.machine,
    PAIRING_OFFER_KIND,
    sealKey,
  );
  if (offerUrl === null) return { ...base, state: "sealedElsewhere" };
  try {
    const profile = await getHostRuntimeStore().upsertTrustedOffer(offerUrl, label);
    return { ...base, state: "added", serverId: profile.serverId };
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
    const sealKey = useGrouponStore.getState().sealKey;
    if (!sealKey || get().syncing) return;
    set({ syncing: true, error: null });
    try {
      const { machines } = await fetchMachines();
      const views: HubMachineView[] = [];
      for (const machine of machines) views.push(await addMachine(machine, sealKey));
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
