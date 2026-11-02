// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for where a session's diff starts, a merge still in progress included.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveSessionBase } from "./session-base.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A repository whose every git call happens at `minute` minutes after 2026-11-02 10:00 UTC. */
function repo() {
  const root = mkdtempSync(join(tmpdir(), "session-base-"));
  roots.push(root);
  const run = (minute: number, args: string[]) => {
    const date = new Date(Date.UTC(2026, 10, 2, 10, minute)).toISOString();
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Nick",
        GIT_AUTHOR_EMAIL: "n@x",
        GIT_COMMITTER_NAME: "Nick",
        GIT_COMMITTER_EMAIL: "n@x",
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_DATE: date,
      },
    }).trim();
  };
  const write = (file: string, text: string) => writeFileSync(join(root, file), text);
  const commit = (minute: number, message: string) => {
    run(minute, ["add", "-A"]);
    run(minute, ["commit", "-q", "-m", message]);
    return run(minute, ["rev-parse", "HEAD"]);
  };
  const at = (minute: number) => new Date(Date.UTC(2026, 10, 2, 10, minute, 30));
  run(0, ["init", "-q", "-b", "main"]);
  write("a.ts", "a1\n");
  write("b.ts", "b1\n");
  const first = commit(0, "Start");
  return { root, run, write, commit, at, first };
}

function show(root: string, base: string | null, file: string): string {
  return execFileSync("git", ["show", `${base}:${file}`], { cwd: root, encoding: "utf8" });
}

describe("resolveSessionBase", () => {
  it("is HEAD when the session started, with what a merge it made of upstream brought in", async () => {
    const r = repo();
    r.run(1, ["checkout", "-q", "-b", "upstream"]);
    r.write("b.ts", "b2 upstream\n");
    r.commit(1, "Upstream work");
    r.run(2, ["checkout", "-q", "main"]);
    // The session starts here, commits its own work, then merges upstream in.
    r.write("a.ts", "a2 session\n");
    r.commit(4, "Session work");
    r.run(5, ["merge", "-q", "--no-edit", "upstream"]);

    const base = await resolveSessionBase(r.root, r.at(3));

    expect(show(r.root, base, "a.ts")).toBe("a1\n");
    expect(show(r.root, base, "b.ts")).toBe("b2 upstream\n");
  });

  it("starts after a branch switch the session made", async () => {
    const r = repo();
    r.run(1, ["checkout", "-q", "-b", "pr"]);
    r.write("a.ts", "a2 pr\n");
    const pr = r.commit(1, "The pull request");
    r.run(2, ["checkout", "-q", "main"]);

    r.run(5, ["checkout", "-q", "pr"]);

    expect(await resolveSessionBase(r.root, r.at(3))).toBe(pr);
    expect(await resolveSessionBase(r.root, r.at(0))).toBe(pr);
  });

  it("shows a conflict the session resolved against what upstream brought", async () => {
    const r = repo();
    r.run(1, ["checkout", "-q", "-b", "upstream"]);
    r.write("a.ts", "a2 upstream\n");
    r.commit(1, "Upstream work");
    r.run(2, ["checkout", "-q", "main"]);
    r.write("a.ts", "a2 session\n");
    r.commit(4, "Session work");
    try {
      r.run(5, ["merge", "-q", "--no-edit", "upstream"]);
    } catch {
      // The conflict the session resolves by hand.
    }
    r.write("a.ts", "a3 resolved\n");
    r.commit(6, "Merge upstream");

    const base = await resolveSessionBase(r.root, r.at(3));

    expect(show(r.root, base, "a.ts")).toBe("a2 upstream\n");
  });

  it("falls back to the merge itself when the branch before the session conflicts with upstream", async () => {
    const r = repo();
    r.run(1, ["checkout", "-q", "-b", "upstream"]);
    r.write("a.ts", "a2 upstream\n");
    r.commit(1, "Upstream work");
    r.run(2, ["checkout", "-q", "main"]);
    r.write("a.ts", "a2 branch\n");
    r.commit(2, "Branch work before the session");
    try {
      r.run(5, ["merge", "-q", "--no-edit", "upstream"]);
    } catch {
      // The conflict the session resolves by hand.
    }
    r.write("a.ts", "a3 resolved\n");
    const merge = r.commit(6, "Merge upstream");

    expect(await resolveSessionBase(r.root, r.at(3))).toBe(merge);
  });

  it("takes what a merge still in progress brings in as given", async () => {
    const r = repo();
    r.run(1, ["checkout", "-q", "-b", "upstream"]);
    r.write("b.ts", "b2 upstream\n");
    r.commit(1, "Upstream work");
    r.run(2, ["checkout", "-q", "main"]);
    r.write("a.ts", "a2 session\n");
    r.commit(4, "Session work");
    r.run(5, ["merge", "-q", "--no-commit", "--no-ff", "upstream"]);

    const base = await resolveSessionBase(r.root, r.at(3));

    expect(show(r.root, base, "a.ts")).toBe("a1\n");
    expect(show(r.root, base, "b.ts")).toBe("b2 upstream\n");
  });

  it("keeps the conflicts of a merge in progress in its base, so only the resolution shows", async () => {
    const r = repo();
    r.run(1, ["checkout", "-q", "-b", "upstream"]);
    r.write("a.ts", "a2 upstream\n");
    r.write("b.ts", "b2 upstream\n");
    r.commit(1, "Upstream work");
    r.run(2, ["checkout", "-q", "main"]);
    r.write("a.ts", "a2 branch\n");
    r.commit(2, "Branch work before the session");
    try {
      r.run(5, ["merge", "-q", "--no-edit", "upstream"]);
    } catch {
      // Still resolving: MERGE_HEAD stays.
    }

    const base = await resolveSessionBase(r.root, r.at(3));

    expect(show(r.root, base, "b.ts")).toBe("b2 upstream\n");
    expect(show(r.root, base, "a.ts")).toMatch(
      /^<<<<<<< [^\n]*\na2 branch\n=======\na2 upstream\n>>>>>>> /,
    );
  });
});
