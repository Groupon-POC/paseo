// Added for Groupon Desk (fork of Paseo, Apache-2.0): a resumed Claude agent's history shows no assistant message made from a non-message transcript entry.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createTestLogger } from "../../../../test-utils/test-logger.js";
import type { AgentStreamEvent, AgentTimelineItem } from "../../agent-sdk-types.js";
import { ClaudeAgentClient, convertClaudeHistoryEntry } from "./agent.js";
import { claudeProjectDirSync } from "./project-dir.js";

/**
 * Claude Code 2.1 writes bookkeeping entries into the session transcript beside the conversation:
 * `api-request-blob` (the request it sent, under `message`, the system prompt with
 * `tool_addition` blocks), `api-request`, `api-request-shape`, `attachment`, `atis-latch`,
 * `queue-operation`, `last-prompt`, `cost-state`, `file-history-snapshot`. The transcript below
 * is the shape of a real one (2026-10-21) that, resumed after a daemon restart, opened with the
 * agent's own environment block as a 50 kB assistant message; text is redacted to a few bytes.
 */

const SESSION_ID = "api-request-blob-session";
const ENVIRONMENT_MARKER = "# Environment REDACTED_SYSTEM_PROMPT";
const REMINDER_MARKER = "<system-reminder>REDACTED_REMINDER</system-reminder>";
const TOKENS_MARKER = "<total_tokens>REDACTED</total_tokens>";

function transcript(cwd: string): Record<string, unknown>[] {
  const common = { sessionId: SESSION_ID, cwd, isSidechain: false, userType: "external" };
  return [
    {
      type: "queue-operation",
      operation: "enqueue",
      timestamp: "2026-10-21T12:00:00.000Z",
      sessionId: SESSION_ID,
    },
    {
      ...common,
      type: "user",
      uuid: "u-1",
      parentUuid: null,
      timestamp: "2026-10-21T12:00:01.000Z",
      message: { role: "user", content: [{ type: "text", text: "List the tools." }] },
    },
    {
      ...common,
      type: "attachment",
      uuid: "a-1",
      parentUuid: "u-1",
      attachment: { type: "deferred_tools", content: "REDACTED" },
      rendered: "REDACTED_ATTACHMENT",
      renderedRole: "user",
    },
    { type: "file-history-snapshot", messageId: "u-1", snapshot: {}, isSnapshotUpdate: false },
    { type: "atis-latch", atis: "REDACTED", sessionId: SESSION_ID },
    { type: "last-prompt", lastPrompt: "List the tools.", leafUuid: "u-1", sessionId: SESSION_ID },
    {
      type: "api-request-shape",
      sessionId: SESSION_ID,
      shapeHash: "h",
      timestamp: "2026-10-21T12:00:02.000Z",
      shape: {},
    },
    {
      type: "api-request-blob",
      sessionId: SESSION_ID,
      hash: "b-user",
      message: {
        role: "user",
        content: [
          { type: "text", text: REMINDER_MARKER },
          { type: "text", text: "List the tools." },
        ],
      },
    },
    {
      type: "api-request-blob",
      sessionId: SESSION_ID,
      hash: "b-system",
      message: {
        role: "system",
        content: [
          { type: "text", text: ENVIRONMENT_MARKER },
          { type: "tool_addition", tool: { name: "Read" } },
          { type: "tool_addition", tool: { name: "Bash" } },
        ],
      },
    },
    {
      type: "api-request",
      sessionId: SESSION_ID,
      id: "r-1",
      timestamp: "2026-10-21T12:00:02.000Z",
      params: {},
    },
    {
      ...common,
      type: "assistant",
      uuid: "as-1",
      parentUuid: "u-1",
      timestamp: "2026-10-21T12:00:03.000Z",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id: "toolu_1", name: "desk_sessions", input: {} }],
      },
    },
    {
      ...common,
      type: "user",
      uuid: "u-2",
      parentUuid: "as-1",
      timestamp: "2026-10-21T12:00:04.000Z",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "REDACTED_RESULT" }],
      },
    },
    {
      type: "api-request-blob",
      sessionId: SESSION_ID,
      hash: "b-tokens",
      message: { role: "system", content: [{ type: "text", text: TOKENS_MARKER }] },
    },
    {
      ...common,
      type: "assistant",
      uuid: "as-2",
      parentUuid: "u-2",
      timestamp: "2026-10-21T12:00:05.000Z",
      message: { role: "assistant", content: [{ type: "text", text: "The real answer." }] },
    },
    {
      ...common,
      type: "system",
      subtype: "stop_hook_summary",
      uuid: "s-1",
      timestamp: "2026-10-21T12:00:06.000Z",
      hookCount: 1,
    },
    { type: "cost-state", sessionId: SESSION_ID, totalCostUSD: 0 },
  ];
}

describe("Claude history replay of Claude Code's bookkeeping entries", () => {
  let tempRoot: string;
  let cwd: string;
  let configDir: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "claude-api-request-blob-"));
    cwd = path.join(tempRoot, "repo");
    configDir = path.join(tempRoot, "claude-config");
    mkdirSync(cwd, { recursive: true });
    vi.stubEnv("CLAUDE_CONFIG_DIR", configDir);
    const historyDir = claudeProjectDirSync(cwd, { configDir });
    mkdirSync(historyDir, { recursive: true });
    writeFileSync(
      path.join(historyDir, `${SESSION_ID}.jsonl`),
      `${transcript(cwd)
        .map((entry) => JSON.stringify(entry))
        .join("\n")}\n`,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(tempRoot, { recursive: true, force: true });
  });

  test("a resumed session replays only the conversation", async () => {
    const client = new ClaudeAgentClient({
      logger: createTestLogger(),
      queryFactory: vi.fn(() => {
        throw new Error("history replay must not start a query");
      }),
      resolveBinary: async () => "/test/claude/bin",
    });
    const session = await client.resumeSession(
      {
        provider: "claude",
        sessionId: SESSION_ID,
        nativeHandle: SESSION_ID,
        metadata: { provider: "claude", cwd },
      },
      { cwd },
    );
    const events: AgentStreamEvent[] = [];
    try {
      for await (const event of session.streamHistory()) events.push(event);
    } finally {
      await session.close();
    }

    const items = events.flatMap((event) => (event.type === "timeline" ? [event.item] : []));
    const messages = items.flatMap((item) =>
      item.type === "user_message" || item.type === "assistant_message"
        ? [{ type: item.type, text: item.text }]
        : [],
    );
    expect(messages).toEqual([
      { type: "user_message", text: "List the tools." },
      { type: "assistant_message", text: "The real answer." },
    ]);
    const callIds = items.flatMap((item) => (item.type === "tool_call" ? [item.callId] : []));
    expect(new Set(callIds)).toEqual(new Set(["toolu_1"]));
    const allText = JSON.stringify(items);
    expect(allText).not.toContain(ENVIRONMENT_MARKER);
    expect(allText).not.toContain(REMINDER_MARKER);
    expect(allText).not.toContain(TOKENS_MARKER);
  });

  test.each(
    transcript("/repo").filter((entry) => entry.type !== "user" && entry.type !== "assistant"),
  )("a $type entry converts to nothing", (entry) => {
    const mapBlocks = vi.fn((): AgentTimelineItem[] => [
      { type: "assistant_message", text: "mapped" },
    ]);
    const historyEntry = entry as Parameters<typeof convertClaudeHistoryEntry>[0];
    expect(convertClaudeHistoryEntry(historyEntry, mapBlocks)).toEqual([]);
    expect(mapBlocks).not.toHaveBeenCalled();
  });
});
