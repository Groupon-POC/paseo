// Added for Groupon Desk (fork of Paseo, Apache-2.0): this Mac's own daemons, so its hub Mac connects directly; which hub Mac this is, daemon or not.

/**
 * The person's Macs come from the hub and connect through Core's relay. The Mac the app runs on
 * also runs its daemon right here (the hand's, `~/.groupon/paseo`): the desktop app names it
 * (`groupon_local_daemons`: server id and listen address from `paseo.pid`), and that Mac's host
 * gets a direct connection beside the relay one. Paseo probes both and uses the faster, so the
 * loopback wins and the relay is the fallback; the direct one authenticates with the daemon's
 * local credential, which the desktop app hands over (`desktop_local_credential`).
 *
 * Which hub Mac the window runs on is known without a daemon too (`groupon_this_machine`: Groupon
 * Desk's own id for this Mac), so a Mac whose hand is not running is still named "this Mac" and
 * listed first, greyed, wherever a Mac is chosen.
 */

import { getDesktopHost } from "@/desktop/host";

export interface LocalDaemon {
  serverId: string;
  listen: string;
}

const isLocalDaemon = (value: unknown): value is LocalDaemon =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { serverId?: unknown }).serverId === "string" &&
  typeof (value as { listen?: unknown }).listen === "string";

/** The daemons running on this Mac; none outside the desktop app (a browser has no such bridge). */
export async function readLocalDaemons(
  invoke: ((command: string) => Promise<unknown>) | undefined = getDesktopHost()?.invoke,
): Promise<LocalDaemon[]> {
  if (!invoke) return [];
  try {
    const answer = await invoke("groupon_local_daemons");
    return Array.isArray(answer) ? answer.filter(isLocalDaemon) : [];
  } catch {
    // An older desktop build without the command: the relay alone, as before.
    return [];
  }
}

/** The listen address of the daemon with this server id, when it runs on this Mac. */
export function localListenFor(daemons: readonly LocalDaemon[], serverId: string): string | null {
  return daemons.find((daemon) => daemon.serverId === serverId)?.listen ?? null;
}

/** This Mac's id on the hub; null outside the desktop app, before Groupon Desk ran here, or on an older desktop build. */
export async function readThisMachineId(
  invoke: ((command: string) => Promise<unknown>) | undefined = getDesktopHost()?.invoke,
): Promise<string | null> {
  if (!invoke) return null;
  try {
    const answer = await invoke("groupon_this_machine");
    return typeof answer === "string" && answer.trim().length > 0 ? answer.trim() : null;
  } catch {
    return null;
  }
}
