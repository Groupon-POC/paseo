// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for reading who last changed each line of a file.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fileBlameArgs, fileBlameOf, fileBlameRequestOf } from "./file-blame.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), "file-blame-"));
  roots.push(root);
  return root;
}

function git(root: string, args: string[], author = "Nick"): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: author,
      GIT_AUTHOR_EMAIL: `${author.toLowerCase()}@x`,
      GIT_AUTHOR_DATE: "2026-10-01T10:00:00Z",
      GIT_COMMITTER_NAME: author,
      GIT_COMMITTER_EMAIL: `${author.toLowerCase()}@x`,
    },
  });
}

function blame(root: string, path: string) {
  const run = spawnSync("git", fileBlameArgs(path), { cwd: root, encoding: "utf8" });
  return fileBlameOf({ stdout: run.stdout, stderr: run.stderr, exitCode: run.status });
}

describe("fileBlameOf", () => {
  it("groups each commit's consecutive lines and reads its author, date and subject", () => {
    const root = folder();
    git(root, ["init", "-q"]);
    writeFileSync(join(root, "a.ts"), "one\ntwo\nthree\n");
    git(root, ["add", "a.ts"]);
    git(root, ["commit", "-q", "-m", "Start the cart (#12)"]);
    writeFileSync(join(root, "a.ts"), "one\nTWO\nthree\nfour\n");
    git(root, ["commit", "-q", "-am", "Tidy"], "Mo");
    const first = git(root, ["rev-parse", "HEAD~1"]).trim();
    const second = git(root, ["rev-parse", "HEAD"]).trim();

    expect(blame(root, "a.ts")).toEqual({
      state: "blamed",
      commits: [
        {
          sha: first,
          author: "Nick",
          email: "nick@x",
          at: "2026-10-01T10:00:00.000Z",
          subject: "Start the cart (#12)",
          uncommitted: false,
        },
        {
          sha: second,
          author: "Mo",
          email: "mo@x",
          at: "2026-10-01T10:00:00.000Z",
          subject: "Tidy",
          uncommitted: false,
        },
      ],
      ranges: [
        { start: 1, count: 1, sha: first },
        { start: 2, count: 1, sha: second },
        { start: 3, count: 1, sha: first },
        { start: 4, count: 1, sha: second },
      ],
    });
  });

  it("marks lines changed in the worktree as not committed", () => {
    const root = folder();
    git(root, ["init", "-q"]);
    writeFileSync(join(root, "a.ts"), "one\ntwo\n");
    git(root, ["add", "a.ts"]);
    git(root, ["commit", "-q", "-m", "Start"]);
    writeFileSync(join(root, "a.ts"), "one\ntwo\nthree\nfour\n");

    const result = blame(root, "a.ts");
    expect(result.state).toBe("blamed");
    if (result.state !== "blamed") return;
    expect(result.ranges.at(-1)).toEqual({ start: 3, count: 2, sha: "0".repeat(40) });
    expect(result.commits.at(-1)).toMatchObject({ uncommitted: true, author: "", subject: "" });
  });

  it("tells a file git does not know yet from a folder outside git", () => {
    const repo = folder();
    git(repo, ["init", "-q"]);
    writeFileSync(join(repo, "a.ts"), "one\n");
    git(repo, ["add", "a.ts"]);
    git(repo, ["commit", "-q", "-m", "Start"]);
    writeFileSync(join(repo, "new.ts"), "new\n");
    const plain = folder();
    mkdirSync(join(plain, "src"));
    writeFileSync(join(plain, "src", "b.ts"), "b\n");

    expect(blame(repo, "new.ts")).toEqual({ state: "untracked" });
    expect(blame(plain, "src/b.ts")).toEqual({ state: "outside-git" });
  });
});

describe("fileBlameRequestOf", () => {
  it("keeps the path inside the workspace", () => {
    expect(fileBlameRequestOf({ workspaceId: "w1", path: "src/a.ts" })).toEqual({
      workspaceId: "w1",
      path: "src/a.ts",
    });
    expect(() => fileBlameRequestOf({ workspaceId: "w1", path: "/etc/passwd" })).toThrow();
    expect(() => fileBlameRequestOf({ workspaceId: "w1", path: "../x" })).toThrow();
    expect(() => fileBlameRequestOf({ workspaceId: "", path: "a.ts" })).toThrow();
  });
});
