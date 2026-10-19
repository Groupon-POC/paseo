// Added for Groupon Desk (fork of Paseo, Apache-2.0): History's tree and its opened messages.
import { createCipheriv, hkdfSync, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sealKeyFromVaultKey } from "./crypto";
import type { HubMessage, HubOverview } from "./hub";
import { historyTree, inputSummary, openMessages, turnResultLine } from "./history";

const LABEL = "groupon-desk-relay/1";
const vaultKey = Buffer.alloc(32, 5);

function sealAsTheHand(body: unknown, scope: string, kind: string, key: Buffer = vaultKey): string {
  const relay = Buffer.from(hkdfSync("sha256", key, Buffer.alloc(0), Buffer.from(LABEL), 32));
  const seal = Buffer.from(
    hkdfSync("sha256", relay, Buffer.alloc(0), Buffer.from(`${LABEL}/seal`), 32),
  );
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", seal, nonce);
  cipher.setAAD(Buffer.from(`${LABEL}:${scope}:${kind}`));
  const sealed = Buffer.concat([cipher.update(JSON.stringify(body), "utf8"), cipher.final()]);
  return Buffer.concat([nonce, sealed, cipher.getAuthTag()]).toString("base64");
}

function row(seq: number, kind: string, envelope: string, chatId = "chat-1"): HubMessage {
  return {
    id: `m${seq}`,
    chatId,
    seq,
    role: "assistant",
    kind,
    envelope,
    costUsd: null,
    senderMachine: null,
    createdAt: "",
  };
}

describe("openMessages", () => {
  const sealKey = sealKeyFromVaultKey(new Uint8Array(vaultKey));

  it("opens every kind the hand stores, under the chat id and the row's kind", () => {
    const bodies = [
      { v: 1, kind: "message", role: "user", text: "hi" },
      {
        v: 1,
        kind: "message",
        role: "assistant",
        model: "m",
        blocks: [{ type: "text", text: "hello" }],
      },
      { v: 1, kind: "tool_result", toolUseId: "t", content: "ok", isError: false },
      {
        v: 1,
        kind: "permission_request",
        requestId: "r",
        toolName: "Bash",
        input: { command: "ls" },
        suggestions: null,
        reason: null,
      },
      {
        v: 1,
        kind: "permission_answer",
        requestId: "r",
        behavior: "deny",
        message: "no",
        always: false,
      },
      {
        v: 1,
        kind: "turn_result",
        costUsd: 0.5,
        durationMs: 1500,
        turns: 1,
        failed: false,
        error: null,
        denials: [],
      },
      { v: 1, kind: "notice", text: "n" },
    ];
    const opened = openMessages(
      bodies.map((body, index) =>
        row(index + 1, body.kind, sealAsTheHand(body, "chat-1", body.kind)),
      ),
      sealKey,
    );
    expect(opened.map((message) => message.body)).toEqual(bodies);
  });

  it("leaves a body it cannot open, or does not know, as null", () => {
    const otherChat = row(
      1,
      "notice",
      sealAsTheHand({ v: 1, kind: "notice", text: "x" }, "chat-2", "notice"),
    );
    const otherVault = row(
      2,
      "notice",
      sealAsTheHand({ v: 1, kind: "notice", text: "x" }, "chat-1", "notice", Buffer.alloc(32, 6)),
    );
    const newerShape = row(
      3,
      "notice",
      sealAsTheHand({ v: 2, kind: "notice", text: "x" }, "chat-1", "notice"),
    );
    expect(
      openMessages([otherChat, otherVault, newerShape], sealKey).map((message) => message.body),
    ).toEqual([null, null, null]);
  });
});

describe("historyTree", () => {
  const overview: HubOverview = {
    machines: [
      {
        machine: "mac-1",
        name: "MacBook",
        model: null,
        alias: "Studio",
        isPrimary: true,
        lastSeenAt: "",
        relaySessionId: null,
        relayConnectedAt: null,
        relayOfferSealed: null,
      },
    ],
    repositories: [
      { id: "r2", remoteUrl: "b", name: "zeta", hidden: false, displayOrder: 1 },
      { id: "r1", remoteUrl: "a", name: "alpha", hidden: false, displayOrder: 0 },
      { id: "r3", remoteUrl: "c", name: "hidden", hidden: true, displayOrder: 2 },
    ],
    workspaces: [
      {
        id: "w1",
        machine: "mac-1",
        repositoryId: "r1",
        branch: "b1",
        targetBranch: "main",
        ticketKey: null,
        name: "old",
        state: "ready",
        status: "idle",
        pinnedAt: null,
        prUrl: null,
        diffAdded: null,
        diffRemoved: null,
        archivedAt: null,
        updatedAt: "2026-10-01",
      },
      {
        id: "w2",
        machine: "mac-1",
        repositoryId: "r1",
        branch: "b2",
        targetBranch: "main",
        ticketKey: null,
        name: "pinned",
        state: "ready",
        status: "idle",
        pinnedAt: "2026-09-01",
        prUrl: null,
        diffAdded: null,
        diffRemoved: null,
        archivedAt: null,
        updatedAt: "2026-09-01",
      },
      {
        id: "w3",
        machine: "mac-9",
        repositoryId: "r3",
        branch: null,
        targetBranch: "main",
        ticketKey: null,
        name: "h",
        state: "ready",
        status: "idle",
        pinnedAt: null,
        prUrl: null,
        diffAdded: null,
        diffRemoved: null,
        archivedAt: null,
        updatedAt: "",
      },
    ],
    chats: [
      {
        id: "c1",
        workspaceId: "w1",
        machine: "mac-1",
        agent: "claude",
        title: null,
        model: "opus",
        effort: null,
        status: "idle",
        unreadCount: 0,
        lastMessageAt: "2026-10-01",
        createdAt: "2026-10-01",
      },
      {
        id: "c2",
        workspaceId: "w1",
        machine: "mac-1",
        agent: "claude",
        title: "Newer",
        model: "opus",
        effort: null,
        status: "idle",
        unreadCount: 0,
        lastMessageAt: "2026-10-02",
        createdAt: "2026-10-02",
      },
    ],
  };

  it("orders repositories, puts pinned workspaces first and newest chats first, names Macs by alias", () => {
    const tree = historyTree(overview);
    expect(tree.map((repository) => repository.name)).toEqual(["alpha"]);
    expect(tree[0].workspaces.map((entry) => entry.workspace.name)).toEqual(["pinned", "old"]);
    expect(tree[0].workspaces[1].machineLabel).toBe("Studio");
    expect(tree[0].workspaces[1].chats.map((chat) => chat.title)).toEqual([
      "Newer",
      "claude · opus",
    ]);
  });
});

describe("lines", () => {
  it("summarises a tool input and a turn", () => {
    expect(inputSummary({ file_path: "/a/b", content: "x" })).toBe("/a/b");
    expect(inputSummary({ command: "ls   -la" })).toBe("ls -la");
    expect(inputSummary({ q: 1 })).toBe('{"q":1}');
    expect(
      turnResultLine({
        v: 1,
        kind: "turn_result",
        costUsd: 0.0123,
        durationMs: 4200,
        turns: 2,
        failed: false,
        error: null,
        denials: [],
      }),
    ).toBe("Done in 4s · 2 steps · $0.01");
  });
});
