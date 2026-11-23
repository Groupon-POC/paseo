// Added for Groupon Desk (fork of Paseo, Apache-2.0): which Mac a chat with no project starts on.

import type { HostRuntimeConnectionStatus } from "@/runtime/host-runtime";

/** The Mac in use if online, else the first online Mac: one Mac down must not block the others. */
export function newChatServerId(
  activeServerId: string | null,
  serverIds: readonly string[],
  statuses: ReadonlyMap<string, HostRuntimeConnectionStatus>,
): string {
  const preferred = activeServerId ?? serverIds[0] ?? "";
  if (statuses.get(preferred) === "online") {
    return preferred;
  }
  return serverIds.find((serverId) => statuses.get(serverId) === "online") ?? preferred;
}
