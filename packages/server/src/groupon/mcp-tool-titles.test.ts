// Added for Groupon Desk (fork of Paseo, Apache-2.0): the titles MCP servers give their tools, read in the background and kept under PASEO_HOME.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  claudeConfigEnv,
  connectionOf,
  expandEnv,
  fingerprintOf,
  knownEnvOf,
  type McpServerConnection,
  mcpToolTitles,
  probeToolTitles,
  titleOfTool,
} from "./mcp-tool-titles.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mcp-tool-titles-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const connected = (name: string, config: unknown) => ({ name, status: "connected", config });

describe("MCP tool titles", () => {
  it("takes a tool's own title, else its annotations' title, collapsed", () => {
    expect(titleOfTool({ name: "a", title: "Who you are", annotations: { title: "x" } })).toBe(
      "Who you are",
    );
    expect(titleOfTool({ name: "a", annotations: { title: "  Query  Loki logs " } })).toBe(
      "Query Loki logs",
    );
    expect(titleOfTool({ name: "a" })).toBeNull();
    expect(titleOfTool({ name: "a", title: "  " })).toBeNull();
  });

  it("opens stdio, http and sse servers, never a claude.ai connector", () => {
    expect(
      connectionOf({ type: "stdio", command: "mcp-grafana", args: ["--transport", "stdio"] }),
    ).toEqual({
      type: "stdio",
      command: "mcp-grafana",
      args: ["--transport", "stdio"],
      env: {},
    });
    expect(connectionOf({ command: "x" })?.type).toBe("stdio");
    expect(connectionOf({ type: "http", url: "http://h/mcp", headers: { A: "b" } })).toEqual({
      type: "http",
      url: "http://h/mcp",
      headers: { A: "b" },
    });
    expect(connectionOf({ type: "claudeai-proxy", url: "https://p", id: "1" })).toBeNull();
    expect(connectionOf({ type: "sdk", name: "x" })).toBeNull();
    expect(connectionOf(null)).toBeNull();
  });

  it("identifies a server by what it runs, never by its secrets", () => {
    const a: McpServerConnection = {
      type: "http",
      url: "http://h/mcp",
      headers: { Authorization: "1" },
    };
    const b: McpServerConnection = { ...a, headers: { Authorization: "2" } };
    expect(fingerprintOf(a)).toBe(fingerprintOf(b));
    expect(fingerprintOf(a)).not.toBe(fingerprintOf({ ...a, url: "http://other/mcp" }));
  });

  it("expands env references the way Claude Code does", () => {
    expect(expandEnv("${HOME_X}/a ${MISSING:-def} ${MISSING}", { HOME_X: "/h" })).toBe("/h/a def ");
  });

  it("reads a stdio server's env from the chat's folder first, then .mcp.json, then the user's scope", async () => {
    const cwd = join(dir, "repo");
    await writeFile(
      join(dir, ".claude.json"),
      JSON.stringify({
        mcpServers: { grafana: { env: { KEY: "user" } }, es: { env: { KEY: "user-es" } } },
        projects: { [cwd]: { mcpServers: { grafana: { env: { KEY: "local" } } } } },
      }),
    );
    expect(await claudeConfigEnv({ name: "grafana", cwd, configDir: dir })).toEqual({
      KEY: "local",
    });
    expect(await claudeConfigEnv({ name: "es", cwd, configDir: dir })).toEqual({ KEY: "user-es" });
    expect(await claudeConfigEnv({ name: "none", cwd, configDir: dir })).toEqual({});
  });

  it("keeps the env the daemon gave an agent's servers", () => {
    expect(
      knownEnvOf({
        door: { command: "groupon", env: { GROUPON_DESK_SESSION_ID: "s" } },
        http: { url: "u" },
      }),
    ).toEqual({ door: { GROUPON_DESK_SESSION_ID: "s" } });
  });

  it("reads a real stdio server's titles", async () => {
    const require = createRequire(import.meta.url);
    const sdk = (path: string) =>
      pathToFileURL(require.resolve(`@modelcontextprotocol/sdk/${path}`)).href;
    const script = join(dir, "server.mjs");
    await writeFile(
      script,
      `import { McpServer } from ${JSON.stringify(sdk("server/mcp.js"))};
import { StdioServerTransport } from ${JSON.stringify(sdk("server/stdio.js"))};
const server = new McpServer({ name: "probe-test", version: "1" });
server.registerTool("desk_self", { title: "Who you are on the desk", description: "d" }, async () => ({ content: [] }));
server.registerTool("query_loki_logs", { description: "d", annotations: { title: "Query Loki logs" } }, async () => ({ content: [] }));
server.registerTool("untitled", { description: "d" }, async () => ({ content: [] }));
await server.connect(new StdioServerTransport());
`,
    );
    const titles = await probeToolTitles({
      type: "stdio",
      command: process.execPath,
      args: [script],
      env: {},
    });
    expect(titles).toEqual({
      desk_self: "Who you are on the desk",
      query_loki_logs: "Query Loki logs",
    });
  });

  it("stores what it read, skips a fresh server and reads a stale or changed one again", async () => {
    let clock = new Date("2026-11-02T10:00:00Z");
    const probed: string[] = [];
    const titles = mcpToolTitles({
      paseoHome: dir,
      now: () => clock,
      envOf: async () => ({ FROM_CONFIG: "1" }),
      probe: async (connection) => {
        probed.push(connection.type === "stdio" ? connection.command : connection.url);
        return { tool_a: `Title ${probed.length}` };
      },
    });
    const statuses = [
      connected("grafana", { type: "stdio", command: "mcp-grafana" }),
      connected("paseo", { type: "http", url: "http://paseo" }),
      connected("claude_ai_Gmail", { type: "claudeai-proxy", url: "https://p", id: "g" }),
      { name: "pending", status: "pending", config: { type: "http", url: "http://pending" } },
    ];

    await titles.observe({ cwd: dir, statuses });
    await titles.observe({ cwd: dir, statuses });
    expect(probed).toEqual(["mcp-grafana"]);
    expect(await titles.all()).toEqual({ grafana: { tool_a: "Title 1" } });

    clock = new Date("2026-11-03T00:00:00Z");
    await titles.observe({ cwd: dir, statuses });
    expect(probed).toEqual(["mcp-grafana", "mcp-grafana"]);

    await titles.observe({
      cwd: dir,
      statuses: [
        connected("grafana", { type: "stdio", command: "mcp-grafana", args: ["--debug"] }),
      ],
    });
    expect(probed).toHaveLength(3);

    await titles.refresh();
    expect(probed).toHaveLength(4);
    expect(await titles.all()).toEqual({ grafana: { tool_a: "Title 4" } });
  });

  it("gives a stdio server the daemon's env before the Claude config's", async () => {
    const envs: Record<string, string>[] = [];
    const titles = mcpToolTitles({
      paseoHome: dir,
      envOf: async () => ({ FROM_CONFIG: "1" }),
      probe: async (connection) => {
        if (connection.type === "stdio") envs.push(connection.env);
        return {};
      },
    });
    await titles.observe({
      cwd: dir,
      statuses: [
        connected("groupon-desk", { type: "stdio", command: "groupon", args: ["mcp", "serve"] }),
        connected("grafana", { type: "stdio", command: "mcp-grafana" }),
      ],
      knownEnv: { "groupon-desk": { GROUPON_DESK_SESSION_ID: "s" } },
    });
    expect(envs).toEqual([{ GROUPON_DESK_SESSION_ID: "s" }, { FROM_CONFIG: "1" }]);
  });

  it("keeps the last titles when a read fails, and says which server failed", async () => {
    const failed: string[] = [];
    let fail = false;
    const titles = mcpToolTitles({
      paseoHome: dir,
      envOf: async () => ({}),
      onError: (server) => failed.push(server),
      probe: async () => {
        if (fail) throw new Error("down");
        return { search: "Search" };
      },
    });
    const statuses = [connected("es", { type: "http", url: "http://es/mcp" })];
    await titles.observe({ cwd: dir, statuses });
    fail = true;
    await titles.refresh();
    expect(failed).toEqual(["es"]);
    expect(await titles.all()).toEqual({ es: { search: "Search" } });
  });
});
