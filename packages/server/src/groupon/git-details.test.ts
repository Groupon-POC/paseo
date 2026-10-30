// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for reading a commit's or a push's details from git.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { gitDetailsArgs, gitDetailsOf, gitDetailsRequestOf } from "./git-details.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(root: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Nick",
      GIT_AUTHOR_EMAIL: "n@x",
      GIT_COMMITTER_NAME: "Nick",
      GIT_COMMITTER_EMAIL: "n@x",
    },
  });
}

describe("gitDetailsOf", () => {
  it("reads a commit's subject, body, author and files with their counts", () => {
    const root = mkdtempSync(join(tmpdir(), "git-details-"));
    roots.push(root);
    git(root, ["init", "-q"]);
    writeFileSync(join(root, "a.ts"), "one\n");
    git(root, ["add", "a.ts"]);
    git(root, ["commit", "-q", "-m", "Start"]);
    writeFileSync(join(root, "a.ts"), "one\ntwo\n");
    writeFileSync(join(root, "b.ts"), "new\n");
    git(root, ["add", "-A"]);
    git(root, ["commit", "-q", "-m", "Tidy the cart\n\nWhy it changed."]);
    const sha = git(root, ["rev-parse", "HEAD"]).trim();
    const first = git(root, ["rev-parse", "HEAD~1"]).trim();

    const [commit] = gitDetailsOf(git(root, gitDetailsArgs(sha.slice(0, 9))));
    expect(commit).toMatchObject({
      sha,
      subject: "Tidy the cart",
      body: "Why it changed.",
      author: "Nick",
      files: [
        { path: "a.ts", additions: 1, deletions: 0 },
        { path: "b.ts", additions: 1, deletions: 0 },
      ],
      moreFiles: 0,
    });
    const pushed = gitDetailsOf(
      git(root, gitDetailsArgs(`${first.slice(0, 9)}..${sha.slice(0, 9)}`)),
    );
    expect(pushed.map((row) => row.subject)).toEqual(["Tidy the cart"]);
  });
});

describe("gitDetailsRequestOf", () => {
  it("takes an absolute folder and a sha or a range, nothing that could be an option", () => {
    expect(gitDetailsRequestOf({ cwd: "/r", revision: "1a2b3c4" })).toEqual({
      cwd: "/r",
      revision: "1a2b3c4",
    });
    expect(gitDetailsRequestOf({ cwd: "/r", revision: "1111111..2222222" }).revision).toBe(
      "1111111..2222222",
    );
    expect(gitDetailsRequestOf({ cwd: "~/projects/paseo", revision: "1a2b3c4" }).cwd).toMatch(
      /^\/.+\/projects\/paseo$/,
    );
    expect(() => gitDetailsRequestOf({ cwd: "r", revision: "1a2b3c4" })).toThrow(/absolute/);
    expect(() => gitDetailsRequestOf({ cwd: "/r", revision: "--output=/tmp/x" })).toThrow(
      /revision/,
    );
    expect(() => gitDetailsRequestOf({ cwd: "/r", revision: "HEAD" })).toThrow(/revision/);
  });
});
