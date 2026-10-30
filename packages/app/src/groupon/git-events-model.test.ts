// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for reading commits and pushes out of shell calls.

import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import { gitEventsOf } from "./git-events-model";

function shell(
  command: string,
  output: string,
  status = "completed",
  exitCode: number | null = 0,
): StreamItem {
  return {
    kind: "tool_call",
    id: "call",
    timestamp: new Date("2026-10-28T12:00:00Z"),
    payload: {
      source: "agent",
      data: {
        name: "Bash",
        status,
        error: null,
        detail: { type: "shell", command, output, exitCode },
      },
    },
  } as unknown as StreamItem;
}

describe("gitEventsOf", () => {
  it("reads a commit's sha, subject and counts from git's own lines", () => {
    const output = [
      "✔️ typecheck (10.28 seconds)",
      "[desk/new-workspace-slash-commands 426a79da0] [ENC-10997] Desk: a session breathes",
      " 6 files changed, 61 insertions(+), 43 deletions(-)",
    ].join("\n");
    expect(
      gitEventsOf(
        shell('git add -A; git commit -m "[ENC-10997] Desk: a session breathes"', output),
      ),
    ).toEqual([
      {
        kind: "commit",
        dir: null,
        status: "done",
        sha: "426a79da0",
        subject: "[ENC-10997] Desk: a session breathes",
        files: 6,
        additions: 61,
        deletions: 43,
        problem: null,
      },
    ]);
  });

  it("takes a quiet commit's subject from its message, a heredoc included", () => {
    const heredoc = "git commit -q -F- <<'EOF'\nFix the cart total\n\nBody line\nEOF";
    expect(gitEventsOf(shell(heredoc, ""))[0]).toMatchObject({
      kind: "commit",
      sha: null,
      subject: "Fix the cart total",
    });
    expect(gitEventsOf(shell("git -C ../x commit -q -m 'One line'", ""))[0]).toMatchObject({
      subject: "One line",
    });
  });

  it("says why a commit failed when git made none", () => {
    const output =
      "✗ typecheck\nerror TS2459: Module declares 'GrouponAdapter' locally\nexit status 1";
    expect(gitEventsOf(shell('git commit -m "x"', output, "failed", 1))[0]).toMatchObject({
      kind: "commit",
      status: "failed",
      sha: null,
      problem: "error TS2459: Module declares 'GrouponAdapter' locally",
    });
  });

  it("reads a push's branch, range and a new branch", () => {
    const pushed =
      "To https://github.com/groupon-poc/paseo.git\n   35d847269..aef9adf08  desk/x -> desk/x";
    expect(gitEventsOf(shell("git push origin desk/x 2>&1 | tail -2", pushed))).toEqual([
      {
        kind: "push",
        dir: null,
        status: "done",
        target: "origin/desk/x",
        range: "35d847269..aef9adf08",
        newBranch: false,
        upToDate: false,
        problem: null,
      },
    ]);
    const created = "To github.com:o/r.git\n * [new branch]      b2b/ENC-1-x -> b2b/ENC-1-x";
    expect(gitEventsOf(shell("git push -u", created))[0]).toMatchObject({
      target: "origin/b2b/ENC-1-x",
      newBranch: true,
    });
  });

  it("marks a rejected push failed with git's reason, and an up-to-date one as such", () => {
    const rejected =
      "To github.com:o/r.git\n ! [rejected]        main -> main (fetch first)\nerror: failed to push some refs";
    expect(gitEventsOf(shell("git push", rejected, "failed", 1))[0]).toMatchObject({
      status: "failed",
      problem: "fetch first",
    });
    expect(gitEventsOf(shell("git push", "Everything up-to-date"))[0]).toMatchObject({
      upToDate: true,
      status: "done",
    });
  });

  it("knows the folder git ran in, from git -C or a cd before it", () => {
    expect(gitEventsOf(shell("cd ~/projects/paseo && git commit -q -m 'x'", ""))[0]?.dir).toBe(
      "~/projects/paseo",
    );
    expect(gitEventsOf(shell('git -C "/r/wt" push', ""))[0]?.dir).toBe("/r/wt");
  });

  it("reads a commit and a push of one call in order, and nothing from other git verbs", () => {
    const output =
      "[main 1a2b3c4] Tidy\n 1 file changed, 1 insertion(+)\nTo x\n   1111111..1a2b3c4  main -> main";
    expect(
      gitEventsOf(shell('git commit -m "Tidy" && git push', output)).map((event) => event.kind),
    ).toEqual(["commit", "push"]);
    expect(gitEventsOf(shell("git log --oneline -3; git status --short", "a\nb"))).toEqual([]);
    expect(gitEventsOf(shell("git push --dry-run", ""))).toEqual([]);
    expect(gitEventsOf(shell('echo "git commit -m x"', ""))).toEqual([]);
  });
});
