// Added for Groupon Desk (fork of Paseo, Apache-2.0): History waits for a Mac instead of failing while none is reachable, and reads again the moment one comes online.

/**
 * Paseo's History asks every host it knows; opened straight by its address in a browser, before
 * the hub sync has added a Mac or before Core's relay has connected it, every host is unreachable
 * and Paseo said "<Mac>: Could not load history" and stayed there. The fork's two rules:
 * - while no Mac in the screen's scope is online, the screen waits for one (no error);
 * - when a Mac comes online that was not before, History is read again, unless a read is already
 *   running (the read Paseo starts by itself on a new host set would otherwise be cancelled and
 *   repeated).
 * Online ids travel as one comma-joined, sorted string, the shape `useOnlineServerIds` returns.
 */

function idsOf(online: string): string[] {
  return online.length > 0 ? online.split(",") : [];
}

/** The ids online in `next` that were not in `previous`. */
export function newlyOnline(previous: string, next: string): string[] {
  const before = new Set(idsOf(previous));
  return idsOf(next).filter((id) => !before.has(id));
}

/** True while no Mac the screen asks about is online (none known yet counts as none online). */
export function historyWaitingForMac(input: {
  scopeServerIds: readonly string[];
  online: string;
}): boolean {
  const online = new Set(idsOf(input.online));
  return !input.scopeServerIds.some((id) => online.has(id));
}

/** Read History again: a Mac came online and no read is running. */
export function shouldRereadHistory(input: {
  previousOnline: string;
  online: string;
  busy: boolean;
}): boolean {
  return !input.busy && newlyOnline(input.previousOnline, input.online).length > 0;
}
