// Added for Groupon Desk (fork of Paseo, Apache-2.0): an MCP call outside Paseo's own tools reads as a name and its main argument.
import { describe, expect, it } from "vitest";

import {
  buildGrouponMcpToolDisplay,
  mainArgument,
  parseMcpToolName,
  toolNameInWords,
} from "./groupon-mcp-tool-display.js";
import { buildToolCallDisplayModel } from "./tool-call-display.js";

function call(toolName: string, input: unknown) {
  return buildGrouponMcpToolDisplay({ toolName, detail: { type: "unknown", input, output: null } });
}

describe("Groupon Desk MCP tool display", () => {
  it("splits an MCP name on the double underscore, keeping a server's single underscores", () => {
    expect(parseMcpToolName("mcp__groupon-desk__desk_self")).toEqual({
      server: "groupon-desk",
      tool: "desk_self",
    });
    expect(parseMcpToolName("mcp__claude_ai_Atlassian_Rovo__getJiraIssue")).toEqual({
      server: "claude_ai_Atlassian_Rovo",
      tool: "getJiraIssue",
    });
    expect(parseMcpToolName("Bash")).toBeNull();
    expect(parseMcpToolName("mcp__groupon-desk")).toBeNull();
    expect(parseMcpToolName("mcp____tool")).toBeNull();
  });

  it("reads a tool's name in words, snake_case and camelCase alike", () => {
    expect(toolNameInWords("getJiraIssue")).toBe("Get jira issue");
    expect(toolNameInWords("desk_self")).toBe("Desk self");
    expect(toolNameInWords("browser-take_screenshot")).toBe("Browser take screenshot");
  });

  it("summarises a call by the field that names what it acts on, else its first short string", () => {
    expect(mainArgument({ cloudId: "groupondev.atlassian.net", issueIdOrKey: "ENC-11662" })).toBe(
      "ENC-11662",
    );
    expect(mainArgument({ limit: 5, file_path: "/tmp/a.ts", mode: "x" })).toBe("/tmp/a.ts");
    expect(mainArgument({ body: "a".repeat(300), label: "short" })).toBe("short");
    expect(mainArgument({ body: "word ".repeat(100) })).toMatch(/…$/);
    expect(mainArgument({ apiToken: "s3cret" })).toBeUndefined();
    expect(mainArgument({ count: 3 })).toBeUndefined();
  });

  it("titles any other server's tool in words, with its main argument or the server's name", () => {
    expect(
      call("mcp__claude_ai_Atlassian_Rovo__getJiraIssue", {
        cloudId: "groupondev.atlassian.net",
        issueIdOrKey: "ENC-11662",
      }),
    ).toEqual({ displayName: "Get jira issue", summary: "ENC-11662" });
    expect(call("mcp__grafana__list_datasources", {})).toEqual({
      displayName: "List datasources",
      summary: "grafana",
    });
  });

  it("names the Groupon Desk door's tools from its table, with what each call acts on", () => {
    expect(call("mcp__groupon-desk__desk_self", {})).toEqual({
      displayName: "This session",
      summary: "groupon-desk",
    });
    expect(
      call("mcp__groupon-desk__desk_start", { prompt: "Fix the bug", repository: "paseo" }),
    ).toEqual({ displayName: "Start task", summary: "paseo" });
    expect(
      call("mcp__groupon-desk__desk_start", { prompt: "Fix", name: "MCP rows", repository: "p" }),
    ).toEqual({ displayName: "Start task", summary: "MCP rows" });
    expect(call("mcp__groupon-desk__desk_session", { session: "a1b2c3" })?.summary).toBe("a1b2c3");
    expect(call("mcp__groupon-desk__desk_move", { path: "/w/paseo-x" })).toEqual({
      displayName: "Move chat",
      summary: "/w/paseo-x",
    });
    expect(call("mcp__groupon-desk__desk_project", { project: "management" })?.summary).toBe(
      "management",
    );
    expect(
      call("mcp__groupon-desk__desk_chat_settings", {
        session: "a1b2",
        model: "claude-opus-5-5",
        effort: "high",
      }),
    ).toEqual({ displayName: "Chat settings", summary: "claude-opus-5-5 · high" });
    expect(call("mcp__groupon-desk__bots_search", { search: "deploy" })).toEqual({
      displayName: "Search bots",
      summary: "deploy",
    });
  });

  it("reads a door tool missing from the table, or a prototype key, like any other tool", () => {
    expect(call("mcp__groupon-desk__desk_future", { session: "abcd" })).toEqual({
      displayName: "Desk future",
      summary: "abcd",
    });
    expect(call("mcp__groupon-desk__constructor", {})?.displayName).toBe("Constructor");
  });

  it("feeds the chat row, and a failed call keeps its error text", () => {
    expect(
      buildToolCallDisplayModel({
        name: "mcp__groupon-desk__desk_start",
        status: "failed",
        error: "The Mac is not on the relay",
        detail: { type: "unknown", input: { prompt: "Go", repository: "paseo" }, output: null },
      }),
    ).toEqual({
      displayName: "Start task",
      summary: "paseo",
      errorText: "The Mac is not on the relay",
    });
    expect(
      buildToolCallDisplayModel({
        name: "mcp__paseo__list_agents",
        status: "completed",
        error: null,
        detail: { type: "unknown", input: {}, output: null },
      }).displayName,
    ).toBe("List agents");
  });
});
