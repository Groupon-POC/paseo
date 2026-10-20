// Added for Groupon Desk (fork of Paseo, Apache-2.0): the Share screen's address, pure so a test can read it.
import type { Href } from "expo-router";

/** The share screen for a hub workspace, by its id or by its folder on a Mac (`share-model.ts`, `hubWorkspaceForPath`). */
export function hubShareRoute(input: { workspaceId?: string; path?: string }): Href {
  const query = new URLSearchParams();
  if (input.workspaceId) query.set("workspaceId", input.workspaceId);
  if (input.path) query.set("path", input.path);
  return `/hub-share?${query.toString()}` as Href;
}
