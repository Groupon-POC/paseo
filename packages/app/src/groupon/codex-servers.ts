// Added for Groupon Desk (fork of Paseo, Apache-2.0): the daemons a Codex session runs on.

/**
 * Which hosts have a session that uses Codex right now. `codex` is the one optional tool a Mac's
 * hand looks for, so the window says it is missing only on a Mac a Codex session runs on
 * (`missing-tools-model.ts`). Read from the agents the app already holds, nothing is asked of a daemon.
 */

import { useMemo } from "react";
import { useSessionStore } from "@/stores/session-store";

/** The server ids with an unarchived Codex agent, sorted and joined: a string, so a read that changes nothing re-renders nothing. */
function readCodexServerIds(
  sessions: ReturnType<typeof useSessionStore.getState>["sessions"],
): string {
  return Object.entries(sessions)
    .filter(([, session]) =>
      [...session.agents.values()].some((agent) => agent.provider === "codex" && !agent.archivedAt),
    )
    .map(([serverId]) => serverId)
    .sort()
    .join(",");
}

export function useCodexServerIds(): ReadonlySet<string> {
  const joined = useSessionStore((state) => readCodexServerIds(state.sessions));
  return useMemo(() => new Set(joined.split(",").filter(Boolean)), [joined]);
}
