// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for reading commits and pushes out of shell calls.

import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import { backgroundOutputPathOf, gitEventsOf, gitEventsOfShell } from "./git-events-model";

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

  it("names a quiet commit from the git log -1 after it, never from one before it", () => {
    const merge = gitEventsOf(
      shell(
        "git add x; git commit -q --no-edit 2>&1 | tail -2; git log --format='%h %s' -1 | cut -c1-120; git log --oneline origin/staging..HEAD | wc -l",
        "0874e1d7f6 Merge remote-tracking branch 'origin/staging' into b2b/x\n       4",
      ),
    )[0];
    expect(merge).toMatchObject({
      sha: "0874e1d7f6",
      subject: "Merge remote-tracking branch 'origin/staging' into b2b/x",
    });
    expect(
      gitEventsOf(shell("git log --oneline -1; git commit -q --no-edit", "1a2b3c4 Before"))[0],
    ).toMatchObject({ sha: null, subject: null });
  });

  it("takes the subject from the commit's own message, never from another command's heredoc", () => {
    const command = [
      "python3 - <<'EOF'",
      'p = "README.md"',
      "s = 'git commit -m nope'",
      "EOF",
      'git add README.md && git commit -q -m "Leave the probes out" -m "Body" && git push origin main 2>&1 | tail -5',
    ].join("\n");
    expect(gitEventsOf(shell(command, "")).map((event) => event.kind)).toEqual(["commit", "push"]);
    expect(gitEventsOf(shell(command, ""))[0]).toMatchObject({ subject: "Leave the probes out" });
  });

  it("names a quiet commit from any counted git log of HEAD after it, not of another branch", () => {
    const heredoc =
      "git commit -q -F - <<'EOF'\nQuiet repeated alerts\n\nWhy.\nEOF\ngit log --oneline -2 && git status --short";
    expect(
      gitEventsOf(shell(heredoc, "e29b449 Quiet repeated alerts\n6f319d6 Skip the warning"))[0],
    ).toMatchObject({ sha: "e29b449", subject: "Quiet repeated alerts" });
    expect(
      gitEventsOf(
        shell("git commit -q -m 'Mine'; git log --oneline -3 origin/groupon", "1a2b3c4 Theirs"),
      )[0],
    ).toMatchObject({ sha: null, subject: "Mine" });
  });

  it("reads a call run in the background from its output file once there is one", () => {
    const output =
      "Command running in background with ID: by4e81z01. Output is being written to: /private/tmp/claude-501/-x/s/tasks/by4e81z01.output. You will be notified when it completes.";
    expect(backgroundOutputPathOf(output)).toBe(
      "/private/tmp/claude-501/-x/s/tasks/by4e81z01.output",
    );
    expect(backgroundOutputPathOf("To x\n   1..2  main -> main")).toBeNull();
    expect(
      gitEventsOfShell(
        "git push origin main 2>&1 | tail -5",
        "To https://github.com/groupon/iq-automation.git\n   6f319d6..e29b449  main -> main\n",
        "done",
      )[0],
    ).toMatchObject({
      kind: "push",
      status: "done",
      range: "6f319d6..e29b449",
      target: "origin/main",
    });
  });

  it("pairs each push of a call with its own ref line", () => {
    const output = [
      "To https://github.com/groupon2/engineering-development",
      " * [new branch]            b2b/x -> b2b/x",
      "To https://github.com/groupon-poc/paseo.git",
      "   9a62e3e6f..735da4921  desk/y -> desk/y",
    ].join("\n");
    const [first, second] = gitEventsOfShell(
      "git push origin b2b/x 2>&1 | tail -2; cd ~/p && git push origin desk/y 2>&1 | tail -2",
      output,
      "done",
    );
    expect(first).toMatchObject({ newBranch: true, range: null, target: "origin/b2b/x" });
    expect(second).toMatchObject({ newBranch: false, range: "9a62e3e6f..735da4921", dir: "~/p" });
  });

  it("marks a push refused even when a pipe cut its ref line and took its exit code", () => {
    expect(
      gitEventsOfShell(
        "git push origin desk/y 2>&1 | tail -1",
        "hint: See the 'Note about fast-forwards' in 'git push --help' for details.",
        "done",
      )[0],
    ).toMatchObject({ status: "failed", problem: "not a fast-forward" });
    expect(
      gitEventsOfShell(
        "git push origin HEAD:refs/heads/b2b/x",
        " * [new branch]  HEAD -> b2b/x",
        "done",
      )[0],
    ).toMatchObject({ target: "origin/b2b/x", newBranch: true });
  });

  it("names a quiet commit from git -C's log too", () => {
    expect(
      gitEventsOf(
        shell(
          'git -C $WT commit -q -m "Fix" && git -C $WT status --porcelain && git -C $WT log --oneline -1',
          "dc64f3d3ab Fix",
        ),
      )[0],
    ).toMatchObject({ sha: "dc64f3d3ab", dir: "$WT" });
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
