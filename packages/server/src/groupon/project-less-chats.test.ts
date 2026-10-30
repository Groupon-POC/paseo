// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for chats started without a project.

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  type MoveChatAgentDeps,
  type PlaceChatDeps,
  type ProjectCandidate,
  buildClassificationPrompt,
  describeProject,
  isUnderChatsRoot,
  moveChatAgent,
  placeChat,
  removeChatFolders,
} from "./project-less-chats.js";

const homes: string[] = [];

function chatsRoot(): string {
  const home = mkdtempSync(join(tmpdir(), "groupon-chats-"));
  homes.push(home);
  return join(home, "chats");
}

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

const MONOREPO: ProjectCandidate = {
  projectId: "p-mono",
  name: "groupon-monorepo",
  rootPath: "/repos/groupon-monorepo",
  kind: "git",
};
const NOTES: ProjectCandidate = {
  projectId: "p-notes",
  name: "notes",
  rootPath: "/repos/notes",
  kind: "non_git",
};

function placeDeps(root: string, overrides: Partial<PlaceChatDeps> = {}): PlaceChatDeps {
  return {
    chatsRoot: root,
    listProjects: async () => [
      MONOREPO,
      NOTES,
      { projectId: "p-chats", name: "No project", rootPath: root, kind: "non_git" },
    ],
    classify: vi.fn(async () => ({ projectId: null, isolation: "local" as const, reason: "none" })),
    ensureChatsProject: async () => ({ projectId: "p-chats", rootPath: root }),
    now: () => new Date("2026-10-27T13:05:00Z"),
    ...overrides,
  };
}

describe("placing a chat by its first message", () => {
  test("a message about a project runs there, in a worktree when it will change files", async () => {
    const root = chatsRoot();
    const placement = await placeChat(
      "fix the login bug in the monorepo",
      placeDeps(root, {
        classify: async () => ({ projectId: "p-mono", isolation: "worktree", reason: "code" }),
      }),
    );
    expect(placement).toEqual({
      kind: "project",
      projectId: "p-mono",
      rootPath: "/repos/groupon-monorepo",
      isolation: "worktree",
      reason: "code",
    });
  });

  test("a folder that is not a repository runs Local whatever the answer", async () => {
    const placement = await placeChat(
      "tidy my notes",
      placeDeps(chatsRoot(), {
        classify: async () => ({ projectId: "p-notes", isolation: "worktree", reason: "edit" }),
      }),
    );
    expect(placement).toMatchObject({ kind: "project", projectId: "p-notes", isolation: "local" });
  });

  test("a general message gets a folder of its own under the chats root", async () => {
    const root = chatsRoot();
    const placement = await placeChat("Check the prod logs for 5xx!", placeDeps(root));
    expect(placement).toEqual({
      kind: "chat",
      projectId: "p-chats",
      path: join(root, "202610271305-check-the-prod-logs-for-5xx"),
    });
    expect(existsSync((placement as { path: string }).path)).toBe(true);
  });

  test("the chats project itself is never offered to the classifier", async () => {
    const root = chatsRoot();
    const classify = vi.fn(async () => ({
      projectId: null,
      isolation: "local" as const,
      reason: "",
    }));
    await placeChat("hello", placeDeps(root, { classify }));
    expect(classify.mock.calls[0]?.[1].map((project) => project.projectId)).toEqual([
      "p-mono",
      "p-notes",
    ]);
  });

  test("a failed, slow or unknown answer still starts the chat in its own folder", async () => {
    for (const classify of [
      async () => {
        throw new Error("no provider");
      },
      () => new Promise<never>(() => {}),
      async () => ({ projectId: "p-gone", isolation: "local" as const, reason: "" }),
    ]) {
      const placement = await placeChat("hi", placeDeps(chatsRoot(), { classify, timeoutMs: 20 }));
      expect(placement.kind).toBe("chat");
    }
  });

  test("an empty message is not classified", async () => {
    const classify = vi.fn();
    const placement = await placeChat("  ", placeDeps(chatsRoot(), { classify }));
    expect(classify).not.toHaveBeenCalled();
    expect(placement.kind).toBe("chat");
  });
});

function moveDeps(root: string, overrides: Partial<MoveChatAgentDeps> = {}) {
  const calls: string[] = [];
  const deps: MoveChatAgentDeps = {
    chatsRoot: root,
    getAgent: async () => ({ provider: "claude", cwd: join(root, "chat-1"), sessionId: "s-1" }),
    getWorkspaceDirectory: async () => "/repos/groupon-monorepo",
    dropAgent: async (id) => {
      calls.push(`drop ${id}`);
    },
    importSession: async (input) => {
      calls.push(`import ${input.providerHandleId} ${input.cwd} ${input.workspaceId}`);
      return "a-2";
    },
    ...overrides,
  };
  return { deps, calls };
}

describe("what the classifier reads about a project", () => {
  test("its README's text and its skill and command names; nothing when it has neither", () => {
    const root = chatsRoot();
    const repo = join(root, "..", "repo");
    mkdirSync(join(repo, ".agents", "skills", "meta-production-release-train"), {
      recursive: true,
    });
    mkdirSync(join(repo, ".claude", "commands"), { recursive: true });
    writeFileSync(join(repo, ".claude", "commands", "rc-status.md"), "x");
    writeFileSync(join(repo, "README.md"), "# Monorepo\n\nGroupon's engineering monorepo.\n");
    const described = describeProject({ ...MONOREPO, rootPath: repo });
    expect(described.summary).toBe("Groupon's engineering monorepo.");
    expect(described.skills).toEqual(["meta-production-release-train", "rc-status"]);
    expect(buildClassificationPrompt("как там релиз трэйн", [described])).toContain(
      "skills: meta-production-release-train, rc-status",
    );

    const empty = describeProject({ ...NOTES, rootPath: join(root, "..", "nothing-here") });
    expect(empty).not.toHaveProperty("summary");
    expect(empty).not.toHaveProperty("skills");
  });
});

test("tells the classifier a mentioned project is not the work, and where management work goes", () => {
  const prompt = buildClassificationPrompt("заполни tempo за неделю, без задач по groupon desk", [
    MONOREPO,
  ]);

  expect(prompt).toContain("a project the message merely mentions");
  expect(prompt).toContain('goes to a project named "management" when there is one, else null');
});

describe("moving a chat into a project", () => {
  test("drops the chat's agent and continues its session in the project's workspace", async () => {
    const { deps, calls } = moveDeps(chatsRoot());
    const result = await moveChatAgent({ agentId: "a-1", targetWorkspaceId: "w-2" }, deps);
    expect(result).toEqual({ agentId: "a-2" });
    expect(calls).toEqual(["drop a-1", "import s-1 /repos/groupon-monorepo w-2"]);
  });

  test("refuses an agent that is not a project-less chat, or not Claude's", async () => {
    const root = chatsRoot();
    for (const agent of [
      { provider: "claude", cwd: "/repos/groupon-monorepo", sessionId: "s" },
      { provider: "codex", cwd: join(root, "chat-1"), sessionId: "s" },
      { provider: "claude", cwd: join(root, "chat-1"), sessionId: null },
    ]) {
      const { deps, calls } = moveDeps(root, { getAgent: async () => agent });
      await expect(
        moveChatAgent({ agentId: "a-1", targetWorkspaceId: "w-2" }, deps),
      ).rejects.toThrow();
      expect(calls).toEqual([]);
    }
  });
});

describe("chat folders", () => {
  test("only a folder under the chats root counts as a chat's, and only those are removed", async () => {
    const root = chatsRoot();
    const inside = join(root, "chat-1");
    const outside = join(root, "..", "elsewhere");
    mkdirSync(inside, { recursive: true });
    mkdirSync(outside, { recursive: true });
    expect(isUnderChatsRoot(root, inside)).toBe(true);
    expect(isUnderChatsRoot(root, root)).toBe(false);
    expect(isUnderChatsRoot(root, outside)).toBe(false);

    await removeChatFolders(root, [inside, outside, root]);

    expect(existsSync(inside)).toBe(false);
    expect(existsSync(outside)).toBe(true);
    expect(existsSync(root)).toBe(true);
  });
});
