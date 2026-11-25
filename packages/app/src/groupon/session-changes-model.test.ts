// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for reading a workspace's session changes in the Changes views.

import { describe, expect, it, vi } from "vitest";
import type { ParsedDiffFile } from "@/git/use-diff-query";
import {
  readSessionChanges,
  readSessionChangesStat,
  sessionChangesError,
  sessionChangesUnsupported,
  sessionDiffFiles,
  sessionFileLocation,
  sessionFileTarget,
  type SessionChangesRepo,
} from "./session-changes-model";

const file = (path: string): ParsedDiffFile => ({
  path,
  isNew: false,
  isDeleted: false,
  additions: 1,
  deletions: 0,
  hunks: [],
});

const repo = (overrides: Partial<SessionChangesRepo>): SessionChangesRepo => ({
  root: "/r/paseo",
  name: "paseo",
  branch: "main",
  baseline: "abc",
  files: [file("src/a.ts")],
  diffTooLarge: false,
  error: null,
  ...overrides,
});

describe("a workspace's session changes in the Changes views", () => {
  it("lists one repository's files as they are, and several under their repositories' names", () => {
    const one = [repo({})];
    const two = [repo({}), repo({ root: "/r/eng", name: "engineering", files: [file("x.md")] })];

    expect(sessionDiffFiles(one).map((f) => f.path)).toEqual(["src/a.ts"]);
    expect(sessionDiffFiles(two).map((f) => f.path)).toEqual([
      "paseo/src/a.ts",
      "engineering/x.md",
    ]);
  });

  it("tells two worktrees of one repository apart by their branches, and finds each file's real place", () => {
    const twins = [
      repo({ root: "/r/mono", name: "monorepo", branch: "ENC-1" }),
      repo({ root: "/r/mono/.claude/worktrees/ENC-2", name: "monorepo", branch: "ENC-2" }),
    ];

    expect(sessionDiffFiles(twins).map((f) => f.path)).toEqual([
      "monorepo (ENC-1)/src/a.ts",
      "monorepo (ENC-2)/src/a.ts",
    ]);
    expect(sessionFileLocation(twins, "monorepo (ENC-2)/src/a.ts")).toBe(
      "/r/mono/.claude/worktrees/ENC-2/src/a.ts",
    );
    expect(sessionFileLocation([repo({})], "src/a.ts")).toBe("/r/paseo/src/a.ts");
    expect(sessionFileLocation(twins, "elsewhere/a.ts")).toBeNull();
  });

  it("reads the daemon's answer, dropping what is not a repository or a file", async () => {
    const client = {
      invokePluginRpc: vi.fn(async () => ({
        repos: [{ ...repo({}), files: [file("src/a.ts"), { nope: true }] }, { name: "no root" }],
      })),
    };

    const repos = await readSessionChanges(client, "ws-1");

    expect(client.invokePluginRpc).toHaveBeenCalledWith(
      "groupon-desk",
      "groupon-desk.session.changes",
      { workspaceId: "ws-1", mode: "all" },
    );
    expect(repos.map((r) => [r.name, r.files.length])).toEqual([["paseo", 1]]);
  });

  it("sends the held revision back, and an unchanged answer keeps the held repositories", async () => {
    const invoke = vi.fn(async (_plugin: string, _method: string, input: unknown) =>
      (input as { knownRevision?: string }).knownRevision === "r1"
        ? { revision: "r1", unchanged: true }
        : { revision: "r1", repos: [repo({})] },
    );
    const client = { invokePluginRpc: invoke };

    const cold = await readSessionChanges(client, "ws-1");
    const warm = await readSessionChanges(client, "ws-1");

    expect(cold.map((found) => found.name)).toEqual(["paseo"]);
    expect(warm).toBe(cold);
    expect(invoke).toHaveBeenNthCalledWith(2, "groupon-desk", "groupon-desk.session.changes", {
      workspaceId: "ws-1",
      mode: "all",
      knownRevision: "r1",
    });
  });

  it("asks again in full when the daemon says unchanged for a revision it does not hold", async () => {
    const invoke = vi.fn(async () => ({ revision: "r2", unchanged: true }));
    const client = { invokePluginRpc: invoke };

    const repos = await readSessionChanges(client, "ws-1");

    expect(repos).toEqual([]);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("reads the stat answer's totals, dropping what is not a repository", async () => {
    const client = {
      invokePluginRpc: vi.fn(async () => ({
        revision: "r1",
        repos: [
          {
            root: "/r/paseo",
            name: "paseo",
            branch: "main",
            additions: 3,
            deletions: 1,
            error: null,
          },
          { name: "no root" },
        ],
      })),
    };

    const repos = await readSessionChangesStat(client, "ws-1");

    expect(client.invokePluginRpc).toHaveBeenCalledWith(
      "groupon-desk",
      "groupon-desk.session.changes.stat",
      { workspaceId: "ws-1", mode: "all" },
    );
    expect(repos).toEqual([
      { root: "/r/paseo", name: "paseo", branch: "main", additions: 3, deletions: 1, error: null },
    ]);
  });

  it("says which repositories could not be diffed", () => {
    expect(sessionChangesError([repo({}), repo({ name: "eng", error: "bad object abc" })])).toBe(
      "eng: bad object abc",
    );
    expect(sessionChangesError([repo({})])).toBeNull();
  });
  it("opens a file in the workspace by its relative path, and one in another repository by its absolute path", () => {
    const repos = [repo({ root: "/r/eng", name: "engineering" }), repo({})];

    expect(sessionFileTarget(repos, "engineering/src/a.ts", "/r/eng")).toBe("src/a.ts");
    expect(sessionFileTarget(repos, "paseo/src/a.ts", "/r/eng/")).toBe("/r/paseo/src/a.ts");
    expect(sessionFileTarget(repos, "unknown.ts", "/r/eng")).toBe("unknown.ts");
  });

  it("knows a daemon that predates the session comparison by its answer", () => {
    expect(
      sessionChangesUnsupported(
        new Error("Unknown Groupon Desk method: groupon-desk.session.changes"),
      ),
    ).toBe(true);
    expect(sessionChangesUnsupported(new Error("bad object abc"))).toBe(false);
    expect(sessionChangesUnsupported(null)).toBe(false);
  });
});
