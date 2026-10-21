// Added for Groupon Desk (fork of Paseo, Apache-2.0): the Share screen's address, pure so a test can read it.
import type { Href } from "expo-router";

/** What the Share screen finds its hub workspace by (`share-screen.tsx`, `resolveWorkspace`). */
export interface HubShareTarget {
  /** The hub's own id, when the caller already knows it. */
  workspaceId?: string;
  /** The Paseo daemon's `serverId` of the host the workspace lives on. */
  serverId?: string;
  /** The workspace's id in that daemon. */
  daemonWorkspaceId?: string;
  /** The workspace's folder on its Mac, the fallback. */
  path?: string;
}

/**
 * The share screen for a hub workspace: by its hub id, or by the daemon ids and folder of a Paseo
 * workspace (`share-model.ts`, `hubWorkspaceForDaemon`).
 */
export function hubShareRoute(input: HubShareTarget): Href {
  const query = new URLSearchParams();
  if (input.workspaceId) query.set("workspaceId", input.workspaceId);
  if (input.serverId) query.set("serverId", input.serverId);
  if (input.daemonWorkspaceId) query.set("daemonWorkspaceId", input.daemonWorkspaceId);
  if (input.path) query.set("path", input.path);
  return `/hub-share?${query.toString()}` as Href;
}
