// Added for Groupon Desk (fork of Paseo, Apache-2.0): a tool row of an MCP call learns its server's title for the tool from the host.

import { parseMcpToolName } from "@getpaseo/protocol/groupon-mcp-tool-display";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import {
  MCP_TOOL_TITLES_REFRESH_MS,
  mcpToolTitleOf,
  readMcpToolTitles,
  type McpToolTitleMap,
} from "./mcp-tool-titles-model";

const NONE: McpToolTitleMap = {};

/** One read per host, shared by every row; rows of other tools ask nothing. */
export function useMcpToolTitle(input: {
  serverId: string | undefined;
  toolName: string;
}): string | undefined {
  const isMcp = parseMcpToolName(input.toolName) !== null;
  // Other rows watch no host, so a host's connection changes never re-render them.
  const serverId = isMcp ? (input.serverId ?? "") : "";
  const client = useHostRuntimeClient(serverId);
  const connected = useHostRuntimeIsConnected(serverId);
  const active = serverId !== "" && Boolean(client) && connected;
  const query = useFetchQuery({
    queryKey: ["groupon-mcp-tool-titles", serverId],
    queryFn: async () => (client ? readMcpToolTitles(client) : NONE),
    enabled: active,
    dataShape: "value",
    retry: false,
    staleTimeMs: MCP_TOOL_TITLES_REFRESH_MS,
    refetchInterval: active ? MCP_TOOL_TITLES_REFRESH_MS : false,
  });
  return isMcp ? mcpToolTitleOf(query.data ?? NONE, input.toolName) : undefined;
}
