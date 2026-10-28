// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for an agent session's own changes, on real git repositories.

import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  getPathsDiffSince,
  listFilesCommittedSince,
  listUncommittedFiles,
  resolveHeadAt,
} from "../utils/checkout-git.js";
import {
  readSessionChanges,
  sessionEditsOf,
  sessionRootHolding,
  shellEditsOf,
  type SessionChangesDeps,
} from "./session-changes.js";

const homes: string[] = [];
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function git(cwd: string, args: string[], at: string) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@example.com",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@example.com",
      GIT_AUTHOR_DATE: at,
      GIT_COMMITTER_DATE: at,
    },
  }).trim();
}

/** A repository with `a.ts` and `other.ts` committed at 10:00. */
function repo(name: string) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "groupon-session-")));
  homes.push(home);
  const root = join(home, name);
  mkdirSync(root);
  git(root, ["init", "-q", "-b", "main"], "2026-01-01T10:00:00Z");
  writeFileSync(join(root, "a.ts"), "one\n");
  writeFileSync(join(root, "other.ts"), "left alone\n");
  git(root, ["add", "."], "2026-01-01T10:00:00Z");
  git(root, ["commit", "-q", "-m", "start"], "2026-01-01T10:00:00Z");
  return { home, root, start: git(root, ["rev-parse", "HEAD"], "2026-01-01T10:00:00Z") };
}

const deps: SessionChangesDeps = {
  worktreeRootOf: async (dir) => {
    try {
      return execFileSync("git", ["rev-parse", "--show-toplevel"], {
        cwd: dir,
        encoding: "utf8",
      }).trim();
    } catch {
      return null;
    }
  },
  nameOf: async (root) => basename(root),
  branchOf: async () => "main",
  headAt: resolveHeadAt,
  diffSince: (root, base, paths) => getPathsDiffSince(root, { baseCommit: base, paths }),
};

const pathsOf = (files: readonly { path: string }[]) => files.map((f) => f.path).sort();
const row = (at: string, item: Record<string, unknown>) => ({ timestamp: at, item });
const edit = (filePath: string, status = "completed") => ({
  type: "tool_call",
  status,
  detail: { type: "edit", filePath },
});

describe("an agent session's own changes", () => {
  test("takes the completed Edit and Write calls, absolute, and nothing else", () => {
    const edits = sessionEditsOf(
      [
        row("2026-01-01T11:00:00Z", edit("src/a.ts")),
        row("2026-01-01T11:01:00Z", {
          type: "tool_call",
          status: "completed",
          detail: { type: "write", filePath: "/abs/b.ts" },
        }),
        row("2026-01-01T11:02:00Z", edit("/abs/c.ts", "failed")),
        row("2026-01-01T11:03:00Z", {
          type: "tool_call",
          status: "completed",
          detail: { type: "shell", command: "ls" },
        }),
      ],
      "/work",
    );

    expect(edits.map((e) => e.path)).toEqual(["/work/src/a.ts", "/abs/b.ts"]);
  });

  test("diffs each repository from HEAD at the first edit: the session's commit, its later edit and its new file, not other files", async () => {
    const first = repo("paseo");
    const second = repo("engineering");
    // The session, from 11:00: edits a.ts, commits it at 12:00, edits it again, adds new.ts.
    writeFileSync(join(first.root, "a.ts"), "two\n");
    git(first.root, ["commit", "-q", "-am", "session"], "2026-01-01T12:00:00Z");
    writeFileSync(join(first.root, "a.ts"), "three\n");
    writeFileSync(join(first.root, "new.ts"), "fresh\n");
    // Somebody else's change in the same checkout, not the session's.
    writeFileSync(join(first.root, "other.ts"), "changed by someone else\n");
    writeFileSync(join(second.root, "a.ts"), "edited later\n");
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "groupon-outside-")));
    homes.push(outside);

    const { repos } = await readSessionChanges(
      [
        { path: join(second.root, "a.ts"), at: new Date("2026-01-01T11:30:00Z") },
        { path: join(first.root, "a.ts"), at: new Date("2026-01-01T11:00:00Z") },
        { path: join(first.root, "new.ts"), at: new Date("2026-01-01T12:30:00Z") },
        { path: join(outside, "notes.md"), at: new Date("2026-01-01T11:10:00Z") },
      ],
      deps,
    );

    expect(repos.map((r) => [r.name, r.baseline, pathsOf(r.files)])).toEqual([
      ["paseo", first.start, ["a.ts", "new.ts"]],
      ["engineering", second.start, ["a.ts"]],
    ]);
    const a = repos[0]?.files.find((f) => f.path === "a.ts");
    expect([a?.additions, a?.deletions]).toEqual([1, 1]);
    expect(repos[0]?.files.find((f) => f.path === "new.ts")?.isNew).toBe(true);
  });
  test("lets the window read a file only inside a repository the session edited", async () => {
    const edited = repo("paseo");
    const untouched = repo("secrets");
    const edits = [{ path: join(edited.root, "a.ts"), at: new Date("2026-01-01T11:00:00Z") }];

    const inside = await sessionRootHolding(
      edits,
      join(edited.root, "other.ts"),
      deps.worktreeRootOf,
    );
    const elsewhere = await sessionRootHolding(
      edits,
      join(untouched.root, "a.ts"),
      deps.worktreeRootOf,
    );
    const climbing = await sessionRootHolding(
      edits,
      join(edited.root, "..", "..", "etc", "passwd"),
      deps.worktreeRootOf,
    );

    expect(inside).toBe(edited.root);
    expect(elsewhere).toBeNull();
    expect(climbing).toBeNull();
  });
});

describe("changes a session made from a shell", () => {
  test("counts its commits and the uncommitted files changed since it started, not older ones", async () => {
    const { root } = repo("paseo");
    // Untracked before the session started: not the session's.
    writeFileSync(join(root, "old-notes.md"), "notes\n");
    utimesSync(
      join(root, "old-notes.md"),
      new Date("2026-01-01T10:30:00Z"),
      new Date("2026-01-01T10:30:00Z"),
    );
    // The session commits from a shell at 12:00, then edits b.ts and leaves it uncommitted.
    writeFileSync(join(root, "a.ts"), "two\n");
    git(root, ["commit", "-q", "-am", "by the session"], "2026-01-01T12:00:00Z");
    writeFileSync(join(root, "b.ts"), "new\n");

    const edits = await shellEditsOf(
      { edits: [], startedIn: [{ dir: root, at: new Date("2026-01-01T11:00:00Z") }] },
      {
        worktreeRootOf: deps.worktreeRootOf,
        committedSince: listFilesCommittedSince,
        uncommitted: listUncommittedFiles,
        modifiedAt: async (path) => statSync(path).mtime,
      },
    );

    expect(edits.map((found) => found.path.slice(root.length + 1)).sort()).toEqual([
      "a.ts",
      "b.ts",
    ]);
    expect(new Set(edits.map((found) => found.at.toISOString()))).toEqual(
      new Set(["2026-01-01T11:00:00.000Z"]),
    );
  });
});
