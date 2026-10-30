// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for reading a commit's or a push's details for the chat's git timeline.

import { describe, expect, it, vi } from "vitest";
import {
  gitDetailsOf,
  problemLinesOf,
  readGitDetails,
  repositoryFolderOf,
} from "./git-details-model";

describe("gitDetailsOf", () => {
  it("keeps the commits and files it can read and drops the rest", () => {
    expect(
      gitDetailsOf({
        commits: [
          {
            sha: "abc1234",
            subject: "Tidy the cart",
            body: "Why.",
            author: "Nick",
            files: [{ path: "a.ts", additions: 2, deletions: 1 }, { path: 3 }, { path: "b.png" }],
            moreFiles: 4,
          },
          { subject: "no sha" },
          null,
        ],
      }),
    ).toEqual([
      {
        sha: "abc1234",
        subject: "Tidy the cart",
        body: "Why.",
        author: "Nick",
        files: [
          { path: "a.ts", additions: 2, deletions: 1 },
          { path: "b.png", additions: null, deletions: null },
        ],
        moreFiles: 4,
      },
    ]);
  });

  it("reads nothing from a daemon that predates the read", () => {
    expect(gitDetailsOf(undefined)).toEqual([]);
    expect(gitDetailsOf({ ok: true })).toEqual([]);
    expect(gitDetailsOf({ commits: "no" })).toEqual([]);
  });

  it("asks the daemon's Groupon Desk plugin with the folder and the revision", async () => {
    const invokePluginRpc = vi.fn(async () => ({ commits: [] }));
    await readGitDetails({ invokePluginRpc }, "/r", "abc1234");
    expect(invokePluginRpc).toHaveBeenCalledWith("groupon-desk", "groupon-desk.git.details", {
      cwd: "/r",
      revision: "abc1234",
    });
  });
});

describe("repositoryFolderOf", () => {
  it("takes the folder the command named, against the call's own", () => {
    expect(repositoryFolderOf("/w", null)).toBe("/w");
    expect(repositoryFolderOf("/w/", "sub")).toBe("/w/sub");
    expect(repositoryFolderOf("/w", "/other")).toBe("/other");
    expect(repositoryFolderOf("/w", "~/projects/paseo")).toBe("~/projects/paseo");
  });
});

describe("problemLinesOf", () => {
  it("keeps the lines that say what went wrong", () => {
    const output = [
      "To github.com:x/y.git",
      " ! [rejected]        main -> main (fetch first)",
      "error: failed to push some refs to 'github.com:x/y.git'",
      "hint: Updates were rejected because the remote contains work",
      "remote: fatal: protected branch",
      "Everything else",
    ].join("\n");
    expect(problemLinesOf(output)).toEqual([
      " ! [rejected]        main -> main (fetch first)",
      "error: failed to push some refs to 'github.com:x/y.git'",
      "hint: Updates were rejected because the remote contains work",
      "fatal: protected branch",
    ]);
    expect(problemLinesOf(output, 1)).toHaveLength(1);
  });
});
