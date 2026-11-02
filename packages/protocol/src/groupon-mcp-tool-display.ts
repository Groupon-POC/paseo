// Added for Groupon Desk (fork of Paseo, Apache-2.0): an MCP call outside Paseo's own tools reads as its server's title for the tool, else a name, and its main argument, not as `mcp__<server>__<tool>`.
import type { ToolCallDetail } from "./agent-types.js";
import { toSummaryText } from "./paseo-tool-presentation/summary-text.js";

type ToolInput = Readonly<Record<string, unknown>>;

export interface GrouponMcpToolName {
  server: string;
  tool: string;
}

export interface GrouponMcpToolDisplay {
  displayName: string;
  summary?: string;
}

interface DoorToolEntry {
  label: string;
  context?: (input: ToolInput) => string | undefined;
}

const DESK_SERVER = "groupon-desk";

// Keys that name what a call acts on, best first; any other short string comes after them.
const MAIN_ARGUMENT_KEYS: readonly RegExp[] = [
  /^session(Id)?$/i,
  /(^|_)path$|Path$/,
  /^project(Key|Id|_key|_id)?$/i,
  /^(query|q|search|jql|cql)$/i,
  /^(key|ticket|issueKey|issueIdOrKey|issue_key)$/i,
  /^title$/i,
  /^name$/i,
  /^(url|uri)$/i,
];
const SECRET_KEY = /token|secret|password|api_?key|credential/i;
const SHORT_ARGUMENT_CHARS = 80;

function field(...keys: string[]): DoorToolEntry["context"] {
  return (input) => keys.map((key) => readString(input[key])).find(Boolean);
}

function joined(...keys: string[]): DoorToolEntry["context"] {
  return (input) => {
    const values = keys.map((key) => readString(input[key])).filter(Boolean);
    return values.length > 0 ? values.join(" · ") : undefined;
  };
}

const DESK_DOOR_TOOLS: Readonly<Record<string, DoorToolEntry>> = {
  desk_self: { label: "This session" },
  desk_sessions: { label: "List sessions", context: field("repository", "mac", "state") },
  desk_session: { label: "Read session", context: field("session") },
  desk_start: { label: "Start task", context: field("name", "repository", "prompt") },
  desk_send: { label: "Send to session", context: field("session") },
  desk_note: { label: "Leave note", context: field("session", "text") },
  desk_notes: { label: "Read notes", context: field("session") },
  desk_watch: { label: "Watch session", context: field("session") },
  desk_move: { label: "Move chat", context: field("path") },
  desk_project: { label: "Move to project", context: field("project") },
  desk_chat_settings: { label: "Chat settings", context: joined("model", "effort", "mode") },
  desk_subscription: { label: "Subscription", context: field("switchTo", "mac") },
  desk_macs: { label: "List Macs" },
  desk_update: { label: "Update Mac", context: joined("action", "mac") },
  desk_answer: { label: "Answer request", context: joined("decision", "session") },
  desk_shares: { label: "List shares" },
  bots_search: { label: "Search bots", context: field("search") },
  bots_get: { label: "Read bot", context: field("botId") },
  bots_open_case: { label: "Open bot case", context: field("message") },
  bots_send: { label: "Message bot", context: field("message") },
  bots_wait: { label: "Wait for bot", context: field("caseId") },
  bots_read: { label: "Read bot case", context: field("caseId") },
  bots_actions: { label: "Bot case actions", context: field("caseId") },
  bots_cancel: { label: "Cancel bot case", context: field("caseId") },
  bots_propose_workflow_rerun: { label: "Propose rerun", context: field("reason") },
};

/** `mcp__<server>__<tool>`; a server name may itself hold single underscores. */
export function parseMcpToolName(name: string): GrouponMcpToolName | null {
  const [prefix, server, ...rest] = name.trim().split("__");
  const tool = rest.join("__");
  return prefix === "mcp" && server && tool ? { server, tool } : null;
}

/** `getJiraIssue` reads "Get jira issue", `desk_self` "Desk self". */
export function toolNameInWords(tool: string): string {
  const sentence = tool
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[\s._-]+/g, " ")
    .trim()
    .toLowerCase();
  return `${sentence[0]?.toUpperCase() ?? ""}${sentence.slice(1)}`;
}

/** The input field that names what the call acts on, clipped to a summary. */
export function mainArgument(input: ToolInput): string | undefined {
  const strings = Object.entries(input).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === "string" && entry[1].trim().length > 0 && !SECRET_KEY.test(entry[0]),
  );
  const named = MAIN_ARGUMENT_KEYS.map((pattern) =>
    strings.find(([key]) => pattern.test(key)),
  ).find(Boolean);
  const short = strings.find(([, value]) => value.trim().length <= SHORT_ARGUMENT_CHARS);
  const chosen = named ?? short ?? strings[0];
  return chosen ? toSummaryText(chosen[1]) : undefined;
}

/** Returns null for a name that is not an MCP tool's. */
export function buildGrouponMcpToolDisplay(input: {
  toolName: string;
  detail: ToolCallDetail;
  /** The tool's title as its server gives it; the door's own short labels still win. */
  serverTitle?: string;
}): GrouponMcpToolDisplay | null {
  const name = parseMcpToolName(input.toolName);
  if (!name) return null;
  const toolInput = readToolInput(input.detail);
  const entry =
    name.server === DESK_SERVER && Object.prototype.hasOwnProperty.call(DESK_DOOR_TOOLS, name.tool)
      ? DESK_DOOR_TOOLS[name.tool]
      : undefined;
  const context = entry ? entry.context?.(toolInput) : mainArgument(toolInput);
  return {
    displayName: entry?.label ?? readString(input.serverTitle) ?? toolNameInWords(name.tool),
    summary: (context ? toSummaryText(context) : undefined) ?? name.server,
  };
}

function readToolInput(detail: ToolCallDetail): ToolInput {
  if (detail.type !== "unknown") return {};
  const value = detail.input;
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
