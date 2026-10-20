// Added for Groupon Desk (fork of Paseo, Apache-2.0): this Mac's own daemons, for a direct connection; the hand alone runs one.

/**
 * Groupon Desk's hand (`groupon desk serve`) runs Paseo's daemon in its own home
 * (`~/.groupon/paseo`), not one the desktop app started. The app reaches that daemon through Core's
 * relay like any other Mac; on this very Mac it connects directly instead, with the daemon's local
 * credential (`<home>/local-credential`, which the hand writes), so no password is asked and a
 * daemon restart does not leave the window reconnecting through the relay.
 *
 * The window never runs a daemon of its own (`GROUPON_DESK_HAND_OWNS_DAEMON`): the hand starts it,
 * registers it on Core's relay, and the window only connects.
 *
 * Responsibilities:
 * - `localDaemonHomes`: the hand's home; with the switch off, also the configured home
 * - `readLocalDaemons`: the daemons running in those homes (`paseo.pid`: server id and listen address)
 * - `readLocalCredentialForRunningDaemon`: the credential of the running daemon listening on a target
 *
 * Constraints:
 * - A credential leaves only for a daemon whose `paseo.pid` names a running process in one of those
 *   homes and whose listen address is the target asked for (`readLocalCredentialForTarget`)
 */

import { homedir } from "node:os";
import path from "node:path";
import type { DaemonInstance } from "@getpaseo/server/daemon-control";

/**
 * Groupon Desk's hand (`groupon desk serve`, a launchd agent) owns this Mac's daemon; the window
 * never starts, restarts or probes one of its own (owner, 2026-10-20, the monorepo's design
 * `groupon-desk-work-window-design.md`, sections 12a and 12b). On, the main process refuses
 * `start_desktop_daemon` and `restart_desktop_daemon`, answers `desktop_daemon_status` as stopped
 * without launching Paseo's CLI, and looks for this Mac's daemon in the hand's home alone. The
 * renderer's switch of the same name (`packages/app/src/groupon/pairing-policy.ts`) keeps the app
 * from asking; this one holds even if it did.
 */
export const GROUPON_DESK_HAND_OWNS_DAEMON = true;

export const HAND_OWNS_DAEMON_MESSAGE =
  "Groupon Desk's hand runs this Mac's daemon (groupon desk serve); the work window never starts one.";

/** Where the hand keeps Paseo's home (`packages/groupon-cli/src/hand/paseo/daemon.ts` in the Groupon monorepo). */
export function grouponHandHome(home: string = homedir()): string {
  return path.join(home, ".groupon", "paseo");
}

export function localDaemonHomes(
  configuredHome: string,
  home: string = homedir(),
  handOwnsDaemon: boolean = GROUPON_DESK_HAND_OWNS_DAEMON,
): string[] {
  const handHome = path.resolve(grouponHandHome(home));
  if (handOwnsDaemon) return [handHome];
  return [...new Set([path.resolve(configuredHome), handHome])];
}

export interface LocalDaemon {
  home: string;
  serverId: string;
  listen: string;
}

export async function readLocalDaemons(
  homes: readonly string[],
  readInstance: (home: string) => Promise<DaemonInstance | null>,
): Promise<LocalDaemon[]> {
  const found: LocalDaemon[] = [];
  for (const home of homes) {
    const instance = await readInstance(home).catch(() => null);
    if (instance?.serverId && instance.listen) {
      found.push({ home, serverId: instance.serverId, listen: instance.listen });
    }
  }
  return found;
}

export async function readLocalCredentialForRunningDaemon(
  homes: readonly string[],
  listen: string,
  readInstance: (home: string) => Promise<DaemonInstance | null>,
  readForTarget: (home: string, target: string) => string | null,
): Promise<string | null> {
  for (const home of homes) {
    const instance = await readInstance(home).catch(() => null);
    if (!instance) continue;
    const credential = readForTarget(home, listen);
    if (credential) return credential;
  }
  return null;
}
