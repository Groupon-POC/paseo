// Added for Groupon Desk (fork of Paseo, Apache-2.0): whether the Mac a workspace runs on is offline, for the host label on its sidebar row.

/**
 * "offline" beside the computer a workspace runs on (owner, 2026-10-26: the notice that a Mac is
 * offline belongs in the sidebar, on Connected computers and on the workspace that uses that Mac),
 * by the very rule Connected computers shows (`computerOffline` in `connected-computers-model.ts`).
 *
 * Responsibilities:
 * - `useComputerOffline(serverId)`: true while that daemon's Mac is offline; false while it is
 *   online or is not one of the person's Macs the hub knows
 * - one shared clock ticking every 10 s while anything reads it, so a Mac whose hand stopped turns
 *   "offline" without a second timer per row
 */

import { useSyncExternalStore } from "react";
import { useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { COMPUTERS_REFRESH_MS, computerOffline } from "./connected-computers-model";
import { useHubMachinesStore } from "./hub-sync";

const listeners = new Set<() => void>();
let clockNow = new Date();
let clockTimer: ReturnType<typeof setInterval> | null = null;

function subscribeClock(listener: () => void): () => void {
  listeners.add(listener);
  if (clockTimer === null) {
    clockNow = new Date();
    clockTimer = setInterval(() => {
      clockNow = new Date();
      for (const notify of listeners) notify();
    }, COMPUTERS_REFRESH_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && clockTimer !== null) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

const readClock = () => clockNow;

export function useComputerOffline(serverId: string): boolean {
  const views = useHubMachinesStore((state) => state.machines);
  const connected = useHostRuntimeIsConnected(serverId);
  const now = useSyncExternalStore(subscribeClock, readClock, readClock);
  return computerOffline({ views, serverId, connected, now });
}
