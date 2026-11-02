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
      tools: { desk_self: "Who you are on the desk", query_loki_logs: "Query Loki logs" },
      names: ["desk_self", "query_loki_logs", "untitled"],
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
        return { tools: { tool_a: `Title ${probed.length}` }, names: ["tool_a", "tool_b"] };
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

    clock = new Date("2026-11-08T09:00:00Z");
    await titles.observe({ cwd: dir, statuses });
    expect(probed).toHaveLength(1);

    clock = new Date("2026-11-09T10:00:00Z");
    await titles.observe({ cwd: dir, statuses });
    expect(probed).toHaveLength(2);

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

  it("reads a fresh server again when it shows a tool the last read did not list", async () => {
    let reads = 0;
    const titles = mcpToolTitles({
      paseoHome: dir,
      envOf: async () => ({}),
      probe: async () => {
        reads += 1;
        return { tools: {}, names: ["desk_self", "desk_start"] };
      },
    });
    const withTools = (...names: string[]) => [
      {
        ...connected("groupon-desk", { command: "groupon" }),
        tools: names.map((name) => ({ name })),
      },
    ];
    await titles.observe({ cwd: dir, statuses: withTools("desk_self", "desk_start") });
    await titles.observe({ cwd: dir, statuses: withTools("desk_start") });
    expect(reads).toBe(1);
    await titles.observe({ cwd: dir, statuses: withTools("desk_start", "desk_new") });
    expect(reads).toBe(2);
  });

  it("gives a stdio server the daemon's env before the Claude config's, read only when it is read", async () => {
    const envs: Record<string, string>[] = [];
    let configReads = 0;
    const titles = mcpToolTitles({
      paseoHome: dir,
      envOf: async () => {
        configReads += 1;
        return { FROM_CONFIG: "1" };
      },
      probe: async (connection) => {
        if (connection.type === "stdio") envs.push(connection.env);
        return { tools: {}, names: [] };
      },
    });
    const input = {
      cwd: dir,
      statuses: [
        connected("groupon-desk", { type: "stdio", command: "groupon", args: ["mcp", "serve"] }),
        connected("grafana", { type: "stdio", command: "mcp-grafana" }),
      ],
      knownEnv: { "groupon-desk": { GROUPON_DESK_SESSION_ID: "s" } },
    };
    await titles.observe(input);
    await titles.observe(input);
    expect(envs).toEqual([{ GROUPON_DESK_SESSION_ID: "s" }, { FROM_CONFIG: "1" }]);
    expect(configReads).toBe(1);
  });

  it("keeps the last titles when a read fails, says which server failed and leaves it alone an hour", async () => {
    let clock = new Date("2026-11-02T10:00:00Z");
    const failed: string[] = [];
    let fail = false;
    let reads = 0;
    const titles = mcpToolTitles({
      paseoHome: dir,
      now: () => clock,
      envOf: async () => ({}),
      onError: (server) => failed.push(server),
      probe: async () => {
        reads += 1;
        if (fail) throw new Error("down");
        return { tools: { search: "Search" }, names: ["search"] };
      },
    });
    const statuses = [connected("es", { type: "http", url: "http://es/mcp" })];
    await titles.observe({ cwd: dir, statuses });
    fail = true;
    await titles.refresh();
    expect(failed).toEqual(["es"]);
    expect(await titles.all()).toEqual({ es: { search: "Search" } });

    clock = new Date("2026-11-10T10:00:00Z");
    await titles.observe({ cwd: dir, statuses });
    expect(reads).toBe(3);
    clock = new Date("2026-11-10T10:30:00Z");
    await titles.observe({ cwd: dir, statuses });
    expect(reads).toBe(3);
    clock = new Date("2026-11-10T11:00:01Z");
    await titles.observe({ cwd: dir, statuses });
    expect(reads).toBe(4);
  });

  it("answers what it has at once while a read hangs, and the caller waits for nothing", async () => {
    const titles = mcpToolTitles({
      paseoHome: dir,
      envOf: async () => ({}),
      probe: () => new Promise(() => undefined),
    });
    const observed = titles.observe({
      cwd: dir,
      statuses: [connected("slow", { type: "http", url: "http://slow/mcp" })],
    });
    const settled = await Promise.race([
      observed.then(() => "observed"),
      new Promise((resolve) => setTimeout(() => resolve("still reading"), 50)),
    ]);
    expect(settled).toBe("still reading");
    expect(await titles.all()).toEqual({});
  });
});
