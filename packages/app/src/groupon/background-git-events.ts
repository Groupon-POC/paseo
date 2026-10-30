// Added for Groupon Desk (fork of Paseo, Apache-2.0): a shell call run in the background reads its commits and pushes from the output file the daemon reads, not from the line saying it went to the background.
import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { readBackgroundOutput } from "./git-details-model";
import {
  backgroundOutputPathOf,
  type GitEvent,
  type GitEventStatus,
  gitEventsOfShell,
} from "./git-events-model";

const RUNNING_REFRESH_MS = 5_000;

function statusOfExit(exitCode: number | null): GitEventStatus {
  if (exitCode === null) return "running";
  return exitCode === 0 ? "done" : "failed";
}

/** The call's events and the output they were read from; a background call's from its file once read. */
export function useResolvedGitEvents(input: {
  events: readonly GitEvent[];
  detail: ToolCallDetail;
  serverId: string;
}): { events: readonly GitEvent[]; output: string } {
  const { events, detail, serverId } = input;
  const command = detail.type === "shell" ? detail.command : "";
  const callOutput = detail.type === "shell" ? (detail.output ?? "") : "";
  const path = backgroundOutputPathOf(callOutput);
  const client = useHostRuntimeClient(serverId);
  const connected = useHostRuntimeIsConnected(serverId);
  const query = useFetchQuery({
    queryKey: ["groupon-background-output", serverId, path],
    queryFn: async () =>
      client && path ? readBackgroundOutput(client, path) : { output: "", exitCode: null },
    enabled: Boolean(client && path) && connected,
    dataShape: "value",
    retry: false,
    staleTimeMs: RUNNING_REFRESH_MS,
    refetchInterval: (state) =>
      state.state.data && state.state.data.exitCode === null ? RUNNING_REFRESH_MS : false,
  });
  if (!path) return { events, output: callOutput };
  const read = query.data;
  if (read) {
    return {
      events: gitEventsOfShell(command, read.output, statusOfExit(read.exitCode)),
      output: read.output,
    };
  }
  // A daemon that predates the read: what the call itself printed.
  if (query.isError) return { events, output: callOutput };
  return { events: gitEventsOfShell(command, "", "running"), output: callOutput };
}
