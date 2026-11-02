// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for what the archive warning counts as uncommitted.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getUncommittedShortstat } from "../utils/checkout-git.js";
import { uncommittedStatRequestOf } from "./uncommitted-stat.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function repo() {
  const root = mkdtempSync(join(tmpdir(), "uncommitted-stat-"));
  roots.push(root);
  const git = (args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Nick",
        GIT_AUTHOR_EMAIL: "n@x",
        GIT_COMMITTER_NAME: "Nick",
        GIT_COMMITTER_EMAIL: "n@x",
      },
    });
  const write = (file: string, text: string) => writeFileSync(join(root, file), text);
  git(["init", "-q", "-b", "main"]);
  write("a.txt", "one\ntwo\nthree\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"]);
  return { root, git, write };
}

describe("getUncommittedShortstat", () => {
  it("is null for a worktree whose commits are all there is", async () => {
    const { root, git, write } = repo();
    write("b.txt", "1\n2\n3\n4\n5\n");
    git(["add", "-A"]);
    git(["commit", "-q", "-m", "a branch's own work"]);

    expect(await getUncommittedShortstat(root)).toBeNull();
  });

  it("counts staged, unstaged and untracked lines, leaving committed work out", async () => {
    const { root, git, write } = repo();
    write("b.txt", "1\n2\n3\n4\n5\n");
    git(["add", "-A"]);
    git(["commit", "-q", "-m", "a branch's own work"]);
    write("a.txt", "one\nTWO\nthree\nfour\n");
    write("c.txt", "staged\n");
    git(["add", "c.txt"]);
    write("new.json", "{\n}\n");

    expect(await getUncommittedShortstat(root)).toEqual({ additions: 5, deletions: 1 });
  });
});

describe("uncommittedStatRequestOf", () => {
  it("takes a workspace id and refuses anything else", () => {
    expect(uncommittedStatRequestOf({ workspaceId: "wks_1" })).toEqual({ workspaceId: "wks_1" });
    expect(() => uncommittedStatRequestOf({ workspaceId: " " })).toThrow("workspaceId");
    expect(() => uncommittedStatRequestOf(null)).toThrow("workspaceId");
  });
});
