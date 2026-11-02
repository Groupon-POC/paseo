// Added for Groupon Desk (fork of Paseo, Apache-2.0): the titles MCP servers give their tools, read in the background from the servers an agent has connected, kept under PASEO_HOME for the chat's tool rows.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { writeJsonFileAtomic } from "../server/atomic-file.js";

/** The Groupon Desk plugin RPC the window calls: `{}`, answered `{ servers: { [server]: { [tool]: title } } }`. */
export const MCP_TOOL_TITLES_RPC = "groupon-desk.mcp.tool-titles";

/** Tools rarely change: a server is read again after a week, or at once when it shows a tool not read yet. */
export const MCP_TOOL_TITLES_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A server that could not be read is left alone this long. */
export const MCP_TOOL_TITLES_RETRY_MS = 60 * 60 * 1000;
const PROBE_TIMEOUT_MS = 20_000;
// Paseo's own tools have their catalog; a claude.ai connector is reachable only through Claude Code.
const SKIPPED_SERVERS = new Set(["paseo"]);

export type McpServerConnection =
  | { type: "stdio"; command: string; args: string[]; env: Record<string, string> }
  | { type: "http" | "sse"; url: string; headers: Record<string, string> };

/** What Claude Code's `mcpServerStatus()` says of one server; only the fields read here. */
export interface McpServerStatusLike {
  name: string;
  status: string;
  scope?: string;
  config?: unknown;
  tools?: readonly { name: string }[];
}

interface StoredServer {
  fingerprint: string;
  probedAt: string;
  tools: Record<string, string>;
  /** Every tool the read listed, titled or not, so a new one is noticed. */
  names?: string[];
}

interface SeenServer {
  base: McpServerConnection;
  cwd: string;
  knownEnv: Record<string, string> | undefined;
}

type StoredTitles = Record<string, StoredServer>;

interface ToolLike {
  name: string;
  title?: unknown;
  annotations?: { title?: unknown } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/** A tool's own `title`, else its annotations' (Claude Code reads only the latter). */
export function titleOfTool(tool: ToolLike): string | null {
  const raw = typeof tool.title === "string" ? tool.title : tool.annotations?.title;
  const title = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  return title || null;
}

/** The connection a status names, or null for one the daemon cannot open (a claude.ai connector, an SDK server). */
export function connectionOf(config: unknown): McpServerConnection | null {
  if (!isRecord(config)) return null;
  const type = config.type ?? "stdio";
  if (type === "stdio" && typeof config.command === "string") {
    const args = Array.isArray(config.args)
      ? config.args.filter((arg): arg is string => typeof arg === "string")
      : [];
    return { type, command: config.command, args, env: stringRecord(config.env) };
  }
  if ((type === "http" || type === "sse") && typeof config.url === "string") {
    return { type, url: config.url, headers: stringRecord(config.headers) };
  }
  return null;
}

/** What identifies a server across reads; never its env or headers, which hold secrets. */
export function fingerprintOf(connection: McpServerConnection): string {
  const shape =
    connection.type === "stdio"
      ? [connection.type, connection.command, ...connection.args]
      : [connection.type, connection.url];
  return createHash("sha256").update(JSON.stringify(shape)).digest("hex").slice(0, 16);
}

/** `${NAME}` and `${NAME:-default}` as Claude Code expands them in an MCP config. */
export function expandEnv(value: string, env: NodeJS.ProcessEnv): string {
  return value.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g,
    (_match, name: string, fallback?: string) => env[name] ?? fallback ?? "",
  );
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

function serverEnvIn(servers: unknown, name: string): Record<string, string> | null {
  const server = isRecord(servers) ? servers[name] : undefined;
  return isRecord(server) && isRecord(server.env) ? stringRecord(server.env) : null;
}

/**
 * Claude Code's status leaves a stdio server's env out, so it is read where Claude Code read it:
 * the chat's folder in `~/.claude.json` (local scope), the folder's `.mcp.json`, the user's scope.
 */
export async function claudeConfigEnv(input: {
  name: string;
  cwd: string;
  configDir?: string;
}): Promise<Record<string, string>> {
  const userFile = input.configDir
    ? join(input.configDir, ".claude.json")
    : join(homedir(), ".claude.json");
  const user = await readJson(userFile);
  const projects = isRecord(user) && isRecord(user.projects) ? user.projects : {};
  const local = isRecord(projects[input.cwd]) ? projects[input.cwd] : {};
  const project = await readJson(join(input.cwd, ".mcp.json"));
  const env =
    serverEnvIn(isRecord(local) ? local.mcpServers : null, input.name) ??
    serverEnvIn(isRecord(project) ? project.mcpServers : null, input.name) ??
    serverEnvIn(isRecord(user) ? user.mcpServers : null, input.name) ??
    {};
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [key, expandEnv(value, process.env)]),
  );
}

function transportOf(connection: McpServerConnection): Transport {
  if (connection.type === "stdio") {
    return new StdioClientTransport({
      command: connection.command,
      args: connection.args,
      env: { ...stringRecord(process.env), ...connection.env },
      stderr: "ignore",
    });
  }
  const requestInit = { headers: connection.headers };
  return connection.type === "sse"
    ? new SSEClientTransport(new URL(connection.url), { requestInit })
    : new StreamableHTTPClientTransport(new URL(connection.url), { requestInit });
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer in ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Connects, lists every page of tools, closes (a stdio server's process ends with it). */
export async function probeToolTitles(
  connection: McpServerConnection,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<{ tools: Record<string, string>; names: string[] }> {
  const client = new Client({ name: "groupon-desk-tool-titles", version: "1" });
  try {
    await withTimeout(client.connect(transportOf(connection)), timeoutMs);
    const tools: Record<string, string> = {};
    const names: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await withTimeout(client.listTools(cursor ? { cursor } : {}), timeoutMs);
      for (const tool of page.tools) {
        names.push(tool.name);
        const title = titleOfTool(tool);
        if (title) tools[tool.name] = title;
      }
      cursor = page.nextCursor;
    } while (cursor);
    return { tools, names };
  } finally {
    await client.close().catch(() => undefined);
  }
}

/** The env the daemon itself gave an agent's servers (the door's), by server. */
export function knownEnvOf(
  servers: Readonly<Record<string, unknown>> | undefined,
): Record<string, Record<string, string>> {
  return Object.fromEntries(
    Object.entries(servers ?? {}).flatMap(([name, server]) =>
      isRecord(server) && isRecord(server.env) ? [[name, stringRecord(server.env)]] : [],
    ),
  );
}

export interface McpToolTitlesDeps {
  paseoHome: string;
  probe?: typeof probeToolTitles;
  envOf?: typeof claudeConfigEnv;
  now?: () => Date;
  onError?: (server: string, error: unknown) => void;
}

/**
 * The daemon's one reader and store of tool titles. Nothing waits on it: an agent hands its servers
 * over and goes on, reads run one at a time behind that, and `all()` answers from the file at once.
 */
export function mcpToolTitles(deps: McpToolTitlesDeps) {
  const path = join(deps.paseoHome, "groupon", "mcp-tool-titles.json");
  const probe = deps.probe ?? probeToolTitles;
  const envOf = deps.envOf ?? claudeConfigEnv;
  const now = deps.now ?? (() => new Date());
  // In memory only: a connection may carry a token.
  const seen = new Map<string, SeenServer>();
  const failedAt = new Map<string, number>();
  let queue: Promise<void> = Promise.resolve();

  const read = async (): Promise<StoredTitles> => {
    const parsed = await readJson(path);
    return isRecord(parsed) ? (parsed as StoredTitles) : {};
  };

  const isDue = (input: {
    stored: StoredServer | undefined;
    fingerprint: string;
    listed: readonly string[];
  }): boolean => {
    const { stored } = input;
    if (!stored || stored.fingerprint !== input.fingerprint) return true;
    if (now().getTime() - Date.parse(stored.probedAt) >= MCP_TOOL_TITLES_TTL_MS) return true;
    const known = stored.names;
    return known !== undefined && input.listed.some((name) => !known.includes(name));
  };

  const connectionFor = async (server: SeenServer, name: string): Promise<McpServerConnection> => {
    if (server.base.type !== "stdio") return server.base;
    const env = server.knownEnv ?? (await envOf({ name, cwd: server.cwd }));
    return { ...server.base, env: { ...env, ...server.base.env } };
  };

  const readServer = async (name: string, server: SeenServer) => {
    try {
      const { tools, names } = await probe(await connectionFor(server, name));
      const entry = {
        fingerprint: fingerprintOf(server.base),
        probedAt: now().toISOString(),
        tools,
        names,
      };
      await writeJsonFileAtomic(path, { ...(await read()), [name]: entry });
      failedAt.delete(name);
    } catch (error) {
      failedAt.set(name, now().getTime());
      deps.onError?.(name, error);
    }
  };

  const recentlyFailed = (name: string): boolean =>
    now().getTime() - (failedAt.get(name) ?? -Infinity) < MCP_TOOL_TITLES_RETRY_MS;

  const enqueue = (work: () => Promise<void>): Promise<void> => {
    queue = queue.then(work, work);
    return queue;
  };

  return {
    /** Reads the connected servers of one agent whose titles are missing, changed, stale or short of a tool. */
    observe(input: {
      cwd: string;
      statuses: readonly McpServerStatusLike[];
      knownEnv?: Readonly<Record<string, Record<string, string>>>;
    }): Promise<void> {
      for (const status of input.statuses) {
        if (status.status !== "connected" || SKIPPED_SERVERS.has(status.name)) continue;
        const base = connectionOf(status.config);
        if (!base) continue;
        const server = { base, cwd: input.cwd, knownEnv: input.knownEnv?.[status.name] };
        seen.set(status.name, server);
        const listed = (status.tools ?? []).map((tool) => tool.name);
        void enqueue(async () => {
          if (recentlyFailed(status.name)) return;
          const stored = (await read())[status.name];
          if (isDue({ stored, fingerprint: fingerprintOf(base), listed })) {
            await readServer(status.name, server);
          }
        });
      }
      return queue;
    },
    /** Reads again every server seen since the daemon started. */
    refresh(): Promise<void> {
      for (const [name, server] of seen) void enqueue(() => readServer(name, server));
      return queue;
    },
    /** Every stored title, by server and tool; never waits for a read in progress. */
    async all(): Promise<Record<string, Record<string, string>>> {
      const stored = await read();
      return Object.fromEntries(
        Object.entries(stored).map(([name, server]) => [name, stringRecord(server?.tools)]),
      );
    },
  };
}

export type McpToolTitles = ReturnType<typeof mcpToolTitles>;

let shared: { titles: McpToolTitles; timer: NodeJS.Timeout } | null = null;

/** Set up once by the daemon; agents report their servers to it, the window reads it. */
export function startMcpToolTitles(deps: McpToolTitlesDeps): McpToolTitles {
  if (shared) clearInterval(shared.timer);
  const titles = mcpToolTitles(deps);
  const timer = setInterval(() => void titles.refresh(), MCP_TOOL_TITLES_TTL_MS);
  timer.unref();
  shared = { titles, timer };
  return titles;
}

export function stopMcpToolTitles(): void {
  if (shared) clearInterval(shared.timer);
  shared = null;
}

/** The daemon's reader, or null where none was started (a provider used outside the daemon). */
export function sharedMcpToolTitles(): McpToolTitles | null {
  return shared?.titles ?? null;
}

/** The answer to `MCP_TOOL_TITLES_RPC`. */
export async function mcpToolTitlesAnswer(): Promise<{
  servers: Record<string, Record<string, string>>;
}> {
  return { servers: (await sharedMcpToolTitles()?.all()) ?? {} };
}
