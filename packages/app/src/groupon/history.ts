// Added for Groupon Desk (fork of Paseo, Apache-2.0): the hub's saved history, opened on the device.

/**
 * What the History screens draw: the person's workspaces and chats from the hub's overview, and a
 * chat's sealed messages opened here with the seal key (scope the chat id, kind the row's kind).
 * The hub keeps these while the Mac sleeps; nothing in this module needs a Mac.
 *
 * `MessageBody` is the hand's plaintext shape (monorepo `packages/groupon-cli/src/hand/protocol.ts`);
 * a body of a version or kind this app does not know is shown as such, never guessed at.
 */

import { openSealedJson } from "./crypto";
import {
  machineLabel,
  type HubChat,
  type HubMessage,
  type HubOverview,
  type HubWorkspace,
} from "./hub";

export type MessageBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

export type MessageBody =
  | {
      v: 1;
      kind: "message";
      role: "user";
      text: string;
      /** The writer's device, as their window named it. */ device?: string;
    }
  | { v: 1; kind: "message"; role: "assistant"; blocks: MessageBlock[]; model: string | null }
  | { v: 1; kind: "tool_result"; toolUseId: string; content: string; isError: boolean }
  | {
      v: 1;
      kind: "permission_request";
      requestId: string;
      toolName: string;
      input: unknown;
      suggestions: unknown;
      reason: string | null;
    }
  | {
      v: 1;
      kind: "permission_answer";
      requestId: string;
      behavior: "allow" | "deny" | "withdrawn";
      message: string | null;
      always: boolean;
    }
  | {
      v: 1;
      kind: "turn_result";
      costUsd: number | null;
      durationMs: number;
      turns: number;
      failed: boolean;
      error: string | null;
      denials: string[];
    }
  | { v: 1; kind: "notice"; text: string };

const KINDS = new Set([
  "message",
  "tool_result",
  "permission_request",
  "permission_answer",
  "turn_result",
  "notice",
]);

export function isMessageBody(value: unknown): value is MessageBody {
  if (!value || typeof value !== "object") return false;
  const body = value as { v?: unknown; kind?: unknown };
  return body.v === 1 && typeof body.kind === "string" && KINDS.has(body.kind);
}

export interface OpenedMessage {
  row: HubMessage;
  /** Null when the envelope does not open with this vault key, or holds a shape this app does not know. */
  body: MessageBody | null;
}

export function openMessages(rows: HubMessage[], sealKey: Uint8Array): OpenedMessage[] {
  return rows.map((row) => {
    const body = openSealedJson(row.envelope, row.chatId, row.kind, sealKey);
    return { row, body: isMessageBody(body) ? body : null };
  });
}

export interface HistoryChat {
  chat: HubChat;
  title: string;
}

export interface HistoryWorkspace {
  workspace: HubWorkspace;
  machineLabel: string;
  chats: HistoryChat[];
}

export interface HistoryRepository {
  id: string;
  name: string;
  workspaces: HistoryWorkspace[];
}

const newestFirst = (a: string | null, b: string | null) => (b ?? "").localeCompare(a ?? "");

/** The overview as History's list: repositories by their order, workspaces pinned then newest, chats newest. */
export function historyTree(overview: HubOverview): HistoryRepository[] {
  const labels = new Map(
    overview.machines.map((machine) => [machine.machine, machineLabel(machine)]),
  );
  const chatsByWorkspace = new Map<string, HistoryChat[]>();
  for (const chat of overview.chats) {
    const list = chatsByWorkspace.get(chat.workspaceId) ?? [];
    list.push({ chat, title: chat.title?.trim() || `${chat.agent} · ${chat.model}` });
    chatsByWorkspace.set(chat.workspaceId, list);
  }
  for (const list of chatsByWorkspace.values()) {
    list.sort((a, b) =>
      newestFirst(
        a.chat.lastMessageAt ?? a.chat.createdAt,
        b.chat.lastMessageAt ?? b.chat.createdAt,
      ),
    );
  }
  return [...overview.repositories]
    .filter((repository) => !repository.hidden)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name))
    .map((repository) => ({
      id: repository.id,
      name: repository.name,
      workspaces: overview.workspaces
        .filter((workspace) => workspace.repositoryId === repository.id)
        .sort(
          (a, b) =>
            Number(Boolean(b.pinnedAt)) - Number(Boolean(a.pinnedAt)) ||
            newestFirst(a.updatedAt, b.updatedAt),
        )
        .map((workspace) => ({
          workspace,
          machineLabel: labels.get(workspace.machine) ?? workspace.machine.slice(0, 8),
          chats: chatsByWorkspace.get(workspace.id) ?? [],
        })),
    }))
    .filter((repository) => repository.workspaces.length > 0);
}

/** A tool's input as one short line: the file path or command when there is one, else compact JSON. */
export function inputSummary(input: unknown, room = 90): string {
  let line: string;
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    const lead = record.file_path ?? record.command ?? record.path ?? record.pattern ?? record.url;
    line = typeof lead === "string" ? lead : JSON.stringify(input);
  } else {
    line = String(input ?? "");
  }
  line = line.replace(/\s+/g, " ").trim();
  return line.length <= room ? line : `${line.slice(0, room - 1)}…`;
}

export function turnResultLine(body: Extract<MessageBody, { kind: "turn_result" }>): string {
  const seconds = Math.max(1, Math.round(body.durationMs / 1000));
  const facts = [`${seconds}s`, `${body.turns} ${body.turns === 1 ? "step" : "steps"}`];
  if (body.costUsd !== null) facts.push(`$${body.costUsd.toFixed(2)}`);
  return `${body.failed ? "Stopped" : "Done"} in ${facts.join(" · ")}`;
}
