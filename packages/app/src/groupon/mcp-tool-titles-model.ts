// Added for Groupon Desk (fork of Paseo, Apache-2.0): the titles MCP servers give their tools, as the host read them, for the chat's tool rows.

import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { parseMcpToolName } from "@getpaseo/protocol/groupon-mcp-tool-display";

const GROUPON_DESK_RPC_PLUGIN_ID = "groupon-desk";
const MCP_TOOL_TITLES_RPC = "groupon-desk.mcp.tool-titles";

/** The host reads a server again at most twice a day; a new one appears within this. */
export const MCP_TOOL_TITLES_REFRESH_MS = 5 * 60 * 1000;

export type McpToolTitleMap = Readonly<Record<string, Readonly<Record<string, string>>>>;

const NONE: McpToolTitleMap = {};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The host's titles by server and tool; none from a host that predates them or cannot answer. */
export async function readMcpToolTitles(
  client: Pick<DaemonClient, "invokePluginRpc">,
): Promise<McpToolTitleMap> {
  try {
    const answer = await client.invokePluginRpc(
      GROUPON_DESK_RPC_PLUGIN_ID,
      MCP_TOOL_TITLES_RPC,
      {},
    );
    return mcpToolTitleMapOf(isRecord(answer) ? answer.servers : null);
  } catch {
    return NONE;
  }
}

export function mcpToolTitleMapOf(servers: unknown): McpToolTitleMap {
  if (!isRecord(servers)) return NONE;
  const map: Record<string, Record<string, string>> = {};
  for (const [server, tools] of Object.entries(servers)) {
    if (!isRecord(tools)) continue;
    map[server] = Object.fromEntries(
      Object.entries(tools).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  }
  return map;
}

/** The title of an `mcp__<server>__<tool>` call's tool, when its server gave one. */
export function mcpToolTitleOf(map: McpToolTitleMap, toolName: string): string | undefined {
  const name = parseMcpToolName(toolName);
  if (!name || !Object.prototype.hasOwnProperty.call(map, name.server)) return undefined;
  const tools = map[name.server];
  return tools && Object.prototype.hasOwnProperty.call(tools, name.tool)
    ? tools[name.tool]
    : undefined;
}
