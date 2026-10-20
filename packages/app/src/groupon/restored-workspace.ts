// Added for Groupon Desk (fork of Paseo, Apache-2.0): a relaunch that reopens a workspace which is gone goes home instead of "Workspace unavailable".

/**
 * At a cold launch Paseo reopens the last workspace before the Mac has listed its workspaces
 * (`app/h/[serverId]/index.tsx`, `resolveHostIndexRoute` restores while the list is "unknown"), so
 * a last workspace that was archived since opened on "Workspace unavailable" with a Back button.
 * The host index notes the workspace it restores; the workspace screen asks `restoredWorkspaceVerdict`
 * once its state settles: gone (missing, archived, nothing to recover) means leave for the home
 * page, anything else means stay, and the note is spent either way. A workspace the person opens
 * themselves is never noted, so a link to a gone workspace still says so.
 */

export interface RestoredWorkspace {
  serverId: string;
  workspaceId: string;
}

/** The workspace screen's states (`screens/workspace/workspace-route-state.ts`) that mean it is gone. */
const GONE = new Set(["missing", "archived", "recoveryUnavailable"]);
/** States that may still turn into either: the Mac is connecting or listing its workspaces. */
const UNSETTLED = new Set(["loading", "reconnecting", "unreachable"]);

let restored: RestoredWorkspace | null = null;

/** The host index is about to reopen this workspace on its own (a relaunch), not on a person's tap. */
export function noteRestoredWorkspace(selection: RestoredWorkspace): void {
  restored = { serverId: selection.serverId, workspaceId: selection.workspaceId };
}

export type RestoredWorkspaceVerdict = "leave" | "stay" | "wait";

/** What the workspace screen does with the state it reached; spends the note once it settles. */
export function restoredWorkspaceVerdict(input: {
  serverId: string;
  workspaceId: string;
  stateKind: string;
}): RestoredWorkspaceVerdict {
  if (
    restored === null ||
    restored.serverId !== input.serverId ||
    restored.workspaceId !== input.workspaceId
  ) {
    return "stay";
  }
  if (UNSETTLED.has(input.stateKind)) return "wait";
  restored = null;
  return GONE.has(input.stateKind) ? "leave" : "stay";
}
