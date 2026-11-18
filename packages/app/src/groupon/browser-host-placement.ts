// Added for Groupon Desk (fork of Paseo, Apache-2.0): a window hosts browser tabs only for its own Mac's daemon.

/**
 * Paseo's window registers as the browser automation host of every daemon it is connected to. A
 * Groupon Desk window is connected to all of the person's Macs (through Core's relay), so the
 * Studio's daemon saw the Air's and the Mini's windows as hosts too, picked the one that
 * registered last for each new tab, and that changed every time a relay socket rolled over
 * (Cloud Run ends each one within 300 s): an agent's tab opened on another Mac, without the
 * sign-ins of this one, its uploads named paths that do not exist there, and its tabs were lost
 * at the next rollover (the monorepo's `.context/paseo-browser/findings.md`, 2026-11-18).
 *
 * So a window is the browser host of its own Mac's daemon alone: an agent's tabs open in the
 * window on the Mac the agent runs on, over the loopback connection, with this Mac's files.
 *
 * Constraints:
 * - Never mount for a daemon that is not running on this Mac (`groupon_local_daemons`)
 * - The unmount returned stops a mount that has not happened yet, as well as one that has
 */

import { readLocalDaemons, type LocalDaemon } from "./local-daemon";

export function mountBrowserHostOnThisMac(input: {
  serverId: string;
  mount: () => () => void;
  readDaemons?: () => Promise<readonly LocalDaemon[]>;
  onError?: (error: unknown) => void;
}): () => void {
  let unmount: (() => void) | null = null;
  let cancelled = false;
  const mountWhenThisMac = async (): Promise<void> => {
    const daemons = await (input.readDaemons ?? readLocalDaemons)();
    if (cancelled) return;
    if (!daemons.some((daemon) => daemon.serverId === input.serverId)) return;
    unmount = input.mount();
  };
  mountWhenThisMac().catch((error: unknown) => input.onError?.(error));
  return () => {
    cancelled = true;
    unmount?.();
    unmount = null;
  };
}
