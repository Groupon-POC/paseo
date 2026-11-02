// Added for Groupon Desk (fork of Paseo, Apache-2.0): the titles MCP servers give their tools, as the host read them.
import { describe, expect, it } from "vitest";

import { mcpToolTitleMapOf, mcpToolTitleOf, readMcpToolTitles } from "./mcp-tool-titles-model";

describe("MCP tool titles from the host", () => {
  it("reads the host's answer, keeping only string titles", async () => {
    const calls: unknown[][] = [];
    const titles = await readMcpToolTitles({
      invokePluginRpc: async (...args: unknown[]) => {
        calls.push(args);
        return {
          servers: { grafana: { query_prometheus: "Query Prometheus metrics", bad: 3 }, x: null },
        };
      },
    } as never);
    expect(calls).toEqual([["groupon-desk", "groupon-desk.mcp.tool-titles", {}]]);
    expect(titles).toEqual({ grafana: { query_prometheus: "Query Prometheus metrics" } });
  });

  it("has no titles from a host that predates them or cannot answer", async () => {
    const titles = await readMcpToolTitles({
      invokePluginRpc: async () => {
        throw new Error("unknown method");
      },
    } as never);
    expect(titles).toEqual({});
    expect(mcpToolTitleMapOf("nope")).toEqual({});
  });

  it("finds a call's title by its server and tool, a server with underscores included", () => {
    const map = mcpToolTitleMapOf({
      claude_ai_Atlassian_Rovo: { getJiraIssue: "Get Jira issue" },
      "playwright-headless": { browser_navigate: "Navigate to a URL" },
    });
    expect(mcpToolTitleOf(map, "mcp__claude_ai_Atlassian_Rovo__getJiraIssue")).toBe(
      "Get Jira issue",
    );
    expect(mcpToolTitleOf(map, "mcp__playwright-headless__browser_navigate")).toBe(
      "Navigate to a URL",
    );
    expect(mcpToolTitleOf(map, "mcp__playwright-headless__browser_click")).toBeUndefined();
    expect(mcpToolTitleOf(map, "mcp__playwright-headless__constructor")).toBeUndefined();
    expect(mcpToolTitleOf(map, "mcp__toString__x")).toBeUndefined();
    expect(mcpToolTitleOf(map, "Bash")).toBeUndefined();
  });
});
