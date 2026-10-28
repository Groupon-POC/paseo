// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for the window's side of chats without a project.

import { describe, expect, it, vi } from "vitest";
import {
  arrangeChatsProject,
  chatCreationTarget,
  isChatsProjectRoot,
  isProjectLessChatDirectory,
  moveChatIntoProject,
  withAgentCwd,
} from "./project-less-chats";

const ROOT = "/Users/nick/.groupon/paseo/chats";

describe("chat folders", () => {
  it("tells the chats root and a chat's own folder from any other path", () => {
    expect(isChatsProjectRoot(ROOT)).toBe(true);
    expect(isChatsProjectRoot(`${ROOT}/`)).toBe(true);
    expect(isChatsProjectRoot("/Users/nick/.paseo/chats")).toBe(true);
    expect(isChatsProjectRoot(`${ROOT}/202610271305-logs`)).toBe(false);
    expect(isChatsProjectRoot("/Users/nick/projects/chats")).toBe(false);
    expect(isProjectLessChatDirectory(`${ROOT}/202610271305-logs`)).toBe(true);
    expect(isProjectLessChatDirectory(ROOT)).toBe(false);
    expect(isProjectLessChatDirectory("/Users/nick/projects/groupon-monorepo")).toBe(false);
  });
});

describe("creating a placed chat", () => {
  it("runs in the project's root, or in the chat's own folder Local", () => {
    expect(
      chatCreationTarget({
        kind: "project",
        projectId: "p-mono",
        rootPath: "/repos/mono",
        isolation: "worktree",
        reason: "",
      }),
    ).toEqual({ projectId: "p-mono", sourceDirectory: "/repos/mono", isolation: "worktree" });
    expect(chatCreationTarget({ kind: "chat", projectId: "p-chats", path: `${ROOT}/x` })).toEqual({
      projectId: "p-chats",
      sourceDirectory: `${ROOT}/x`,
      isolation: "local",
    });
  });

  it("moves the first agent's folder and leaves out what the request did not carry", () => {
    expect(withAgentCwd({ config: { cwd: ROOT, provider: "claude" } }, "/repos/mono")).toEqual({
      config: { cwd: "/repos/mono", provider: "claude" },
    });
    expect(withAgentCwd({ cwd: ROOT }, "/repos/mono")).toEqual({ cwd: "/repos/mono" });
  });
});

describe("No project in the sidebar", () => {
  const project = (iconWorkingDir: string, workspaces: number) => ({
    iconWorkingDir,
    workspaces: Array.from({ length: workspaces }, (_, index) => index),
  });

  it("leads while it holds a chat and is hidden when empty", () => {
    const mono = project("/repos/mono", 2);
    const chats = project(ROOT, 1);
    expect(arrangeChatsProject([mono, chats])).toEqual([chats, mono]);
    expect(arrangeChatsProject([mono, project(ROOT, 0)])).toEqual([mono]);
    expect(arrangeChatsProject([mono])).toEqual([mono]);
  });
});

describe("moving a chat into a project", () => {
  function fakeClient() {
    const calls: string[] = [];
    const client = {
      createWorkspace: vi.fn(async (input: { source: { kind: string } }) => {
        calls.push(`create ${input.source.kind}`);
        return { workspace: { id: "w-target" }, error: null };
      }),
      invokePluginRpc: vi.fn(async (_plugin: string, method: string, input: unknown) => {
        calls.push(`${method} ${JSON.stringify(input)}`);
        return { agentId: "a-new" };
      }),
      archiveWorkspace: vi.fn(async (workspaceId: string) => {
        calls.push(`archive ${workspaceId}`);
        return {};
      }),
    };
    return { client, calls };
  }

  it("creates the workspace, continues each conversation there, then archives the chat", async () => {
    const { client, calls } = fakeClient();
    const workspace = await moveChatIntoProject({
      client: client as never,
      chatWorkspaceId: "w-chat",
      agentIds: ["a-1"],
      target: { projectId: "p-mono", rootPath: "/repos/mono", isolation: "worktree" },
      idempotencyKey: "k",
    });
    expect(workspace).toEqual({ id: "w-target" });
    expect(calls).toEqual([
      "create worktree",
      'groupon-desk.chats.move {"agentId":"a-1","targetWorkspaceId":"w-target"}',
      "archive w-chat",
    ]);
  });

  it("refuses a chat with no conversation before creating anything", async () => {
    const { client, calls } = fakeClient();
    await expect(
      moveChatIntoProject({
        client: client as never,
        chatWorkspaceId: "w-chat",
        agentIds: [],
        target: { projectId: "p-mono", rootPath: "/repos/mono", isolation: "local" },
        idempotencyKey: "k",
      }),
    ).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});
