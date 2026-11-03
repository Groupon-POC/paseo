// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for the blame bar's model.

import { describe, expect, it } from "vitest";
import {
  changeRequestNumberOf,
  commitAtLine,
  fileAuthors,
  fileBlameOf,
  newestCommit,
  readFileBlame,
  workspaceRelativePath,
} from "./file-blame-model";

const UNCOMMITTED = "0".repeat(40);

const answer = {
  blame: {
    state: "blamed",
    commits: [
      {
        sha: "a1",
        author: "Mo",
        email: "mo@x",
        at: "2026-04-07T08:43:14.000Z",
        subject: "Start (#545)",
        uncommitted: false,
      },
      {
        sha: "b2",
        author: "Nick",
        email: "n@x",
        at: "2026-10-30T10:00:00.000Z",
        subject: "Tidy",
        uncommitted: false,
      },
      {
        sha: UNCOMMITTED,
        author: "",
        email: "",
        at: "2026-11-03T11:00:00.000Z",
        subject: "",
        uncommitted: true,
      },
    ],
    ranges: [
      { start: 5, count: 2, sha: UNCOMMITTED },
      { start: 1, count: 3, sha: "a1" },
      { start: 4, count: 1, sha: "b2" },
    ],
  },
};

function blamed() {
  const blame = fileBlameOf(answer);
  if (blame?.state !== "blamed") throw new Error("expected a blame");
  return blame;
}

describe("fileBlameOf", () => {
  it("reads the commits by sha and orders the ranges by line", () => {
    const blame = blamed();
    expect(Object.keys(blame.commits)).toEqual(["a1", "b2", UNCOMMITTED]);
    expect(blame.ranges.map((range) => range.start)).toEqual([1, 4, 5]);
  });

  it("passes on why a file has no blame, and drops what it cannot read", () => {
    expect(fileBlameOf({ blame: { state: "untracked" } })).toEqual({ state: "untracked" });
    expect(fileBlameOf({ blame: { state: "outside-git" } })).toEqual({ state: "outside-git" });
    expect(fileBlameOf({})).toBeNull();
    expect(fileBlameOf({ blame: { state: "blamed", commits: "x", ranges: [] } })).toBeNull();
  });
});

describe("commitAtLine", () => {
  it("finds the commit of every line and nothing past the file", () => {
    const blame = blamed();
    expect([1, 3, 4, 5, 6].map((line) => commitAtLine(blame, line)?.sha)).toEqual([
      "a1",
      "a1",
      "b2",
      UNCOMMITTED,
      UNCOMMITTED,
    ]);
    expect(commitAtLine(blame, 7)).toBeNull();
    expect(commitAtLine(blame, 0)).toBeNull();
  });
});

describe("newestCommit", () => {
  it("is the latest committed change, never the uncommitted lines", () => {
    expect(newestCommit(blamed())?.sha).toBe("b2");
  });
});

describe("fileAuthors", () => {
  it("counts each author's lines, the uncommitted ones together", () => {
    expect(fileAuthors(blamed())).toEqual([
      { name: "Mo", lines: 3, share: 0.5 },
      { name: null, lines: 2, share: 2 / 6 },
      { name: "Nick", lines: 1, share: 1 / 6 },
    ]);
  });
});

describe("changeRequestNumberOf", () => {
  it("reads a squash's number and a merge's number", () => {
    expect(changeRequestNumberOf("chore: drive linter to zero (#545)")).toBe(545);
    expect(changeRequestNumberOf("Merge pull request #9 from Groupon-POC/desk")).toBe(9);
    expect(changeRequestNumberOf("Fix #12 in the cart")).toBeNull();
  });
});

describe("workspaceRelativePath", () => {
  it("is the path inside the workspace, and null outside it", () => {
    expect(workspaceRelativePath("/repo/", "/repo/src/a.ts")).toBe("src/a.ts");
    expect(workspaceRelativePath("/repo", "/repository/a.ts")).toBeNull();
    expect(workspaceRelativePath("/repo", "/other/a.ts")).toBeNull();
  });
});

describe("readFileBlame", () => {
  it("is null on a daemon that predates the read", async () => {
    const client = {
      invokePluginRpc: async () => {
        throw new Error("Unknown Groupon Desk method: groupon-desk.git.blame");
      },
    };
    await expect(readFileBlame(client, "w1", "a.ts")).resolves.toBeNull();
  });

  it("asks for the workspace's file and passes on other failures", async () => {
    const calls: unknown[] = [];
    const client = {
      invokePluginRpc: async (...args: unknown[]) => {
        calls.push(args);
        return answer;
      },
    };
    await expect(readFileBlame(client, "w1", "src/a.ts")).resolves.toMatchObject({
      state: "blamed",
    });
    expect(calls).toEqual([
      ["groupon-desk", "groupon-desk.git.blame", { workspaceId: "w1", path: "src/a.ts" }],
    ]);
    const failing = {
      invokePluginRpc: async () => {
        throw new Error("git blame timed out");
      },
    };
    await expect(readFileBlame(failing, "w1", "a.ts")).rejects.toThrow("timed out");
  });
});
