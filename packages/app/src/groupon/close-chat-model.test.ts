// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for what closing a chat's tab says and takes along.

import { describe, expect, it } from "vitest";
import {
  closeChatDialogOf,
  type ClosedChat,
  isLastChatOfWorkspace,
  reopenClosedChat,
  rememberClosedChat,
  takeLastClosedChat,
} from "./close-chat-model";

const facts = { running: false, lastInWorkspace: true, removesWorktree: false, risks: [] };

describe("closeChatDialogOf", () => {
  it("says the session goes with the workspace's last chat", () => {
    expect(closeChatDialogOf(facts)).toEqual({
      title: "Archive this chat?",
      message:
        "The chat and its session move to the archive and leave the sidebar. You can bring the chat back from History.",
      warnings: [],
      confirmLabel: "Archive",
    });
  });

  it("says the session stays when it has more", () => {
    expect(closeChatDialogOf({ ...facts, lastInWorkspace: false }).message).toBe(
      "The chat moves to the archive. Its session stays in the sidebar. You can bring the chat back from History.",
    );
  });

  it("says a running agent stops", () => {
    const dialog = closeChatDialogOf({ ...facts, running: true });
    expect(dialog.title).toBe("Stop and archive this chat?");
    expect(dialog.confirmLabel).toBe("Stop and archive");
    expect(dialog.message.startsWith("The agent is still running and will stop. ")).toBe(true);
  });

  it("lists what a removed worktree loses, and only then", () => {
    const risks = ["Uncommitted changes (12 added lines)"];
    const removed = closeChatDialogOf({ ...facts, removesWorktree: true, risks });
    expect(removed.warnings).toEqual(risks);
    expect(removed.message).toContain("the worktree is removed");
    expect(removed.message).toContain("but not what is listed below");
    expect(closeChatDialogOf({ ...facts, risks }).warnings).toEqual([]);
  });
});

describe("isLastChatOfWorkspace", () => {
  const input = { agentId: "a", workspaceId: "w", hasTerminalTab: false };

  it("leaves out this chat, subagents, archived chats and other workspaces", () => {
    const agents = [
      { id: "a", workspaceId: "w" },
      { id: "sub", workspaceId: "w", parentAgentId: "a" },
      { id: "old", workspaceId: "w", archivedAt: new Date() },
      { id: "far", workspaceId: "other" },
    ];
    expect(isLastChatOfWorkspace({ ...input, agents })).toBe(true);
  });

  it("is kept by another chat or a terminal", () => {
    expect(isLastChatOfWorkspace({ ...input, agents: [{ id: "b", workspaceId: "w" }] })).toBe(
      false,
    );
    expect(isLastChatOfWorkspace({ ...input, agents: [], hasTerminalTab: true })).toBe(false);
  });
});

const chat = (agentId: string, workspaceArchived = false): ClosedChat => ({
  serverId: "s",
  workspaceId: "w",
  agentId,
  workspaceArchived,
});

describe("the closed chats", () => {
  it("come back newest first, each once", () => {
    rememberClosedChat(chat("a"));
    rememberClosedChat(chat("b"));
    rememberClosedChat(chat("a"));
    expect(takeLastClosedChat()?.agentId).toBe("a");
    expect(takeLastClosedChat()?.agentId).toBe("b");
    expect(takeLastClosedChat()).toBeNull();
  });

  it("keep the newest twenty", () => {
    for (let index = 0; index < 25; index += 1) rememberClosedChat(chat(`c${index}`));
    const taken: string[] = [];
    for (let row = takeLastClosedChat(); row; row = takeLastClosedChat()) taken.push(row.agentId);
    expect(taken).toHaveLength(20);
    expect(taken[0]).toBe("c24");
    expect(taken.at(-1)).toBe("c5");
  });
});

describe("reopenClosedChat", () => {
  function deps() {
    const calls: string[] = [];
    return {
      calls,
      deps: {
        restoreWorkspace: async (id: string) => calls.push(`restore ${id}`),
        unarchiveChat: async (id: string) => calls.push(`unarchive ${id}`),
        openChat: (row: ClosedChat) => {
          calls.push(`open ${row.agentId}`);
        },
      },
    };
  }

  it("restores an archived workspace before the chat", async () => {
    const run = deps();
    await reopenClosedChat(chat("a", true), run.deps);
    expect(run.calls).toEqual(["restore w", "unarchive a", "open a"]);
  });

  it("leaves a workspace that was not archived alone", async () => {
    const run = deps();
    await reopenClosedChat(chat("a"), run.deps);
    expect(run.calls).toEqual(["unarchive a", "open a"]);
  });
});
