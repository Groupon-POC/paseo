// Added for Groupon Desk (fork of Paseo, Apache-2.0): where a session's diff starts in a repository, so a branch switch or a merge of upstream the session made itself, finished or still in progress, never counts as its work.

/**
 * HEAD when the session first touched the repository, moved past the last branch switch after
 * that (the session's work is on the branch it switched to), and with what the newest merge on
 * HEAD's first-parent line brought in taken as given: `git merge-tree` of that base with the
 * merged-in side gives the tree a merge alone would have made, recorded as a commit object so the
 * diff reads it like any base. The diff from it shows the session's commits, its edits and how it
 * resolved the merge, never the commits upstream brought.
 *
 * Constraints:
 * - Read-only for refs: the merge's tree and its commit are loose objects nobody points at (git's
 *   own gc drops them), the same each time for the same inputs (fixed author and dates)
 * - A merge `git merge-tree` cannot make cleanly falls back to the merge commit itself: the work
 *   after it shows, a resolution and earlier commits do not
 * - A merge still in progress (`MERGE_HEAD`) is the newest merge: its upstream is taken as given
 *   before the merge commit exists. With no commit to fall back to, a conflicted one keeps
 *   `git merge-tree`'s tree, conflict markers and all, so the diff shows how the session resolved it
 */

import { runGitCommand } from "../utils/run-git-command.js";

const READ_ONLY = { GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" } as const;
const FIXED_IDENTITY = {
  GIT_AUTHOR_NAME: "Groupon Desk",
  GIT_AUTHOR_EMAIL: "desk@groupon.invalid",
  GIT_AUTHOR_DATE: "1970-01-01T00:00:00Z",
  GIT_COMMITTER_NAME: "Groupon Desk",
  GIT_COMMITTER_EMAIL: "desk@groupon.invalid",
  GIT_COMMITTER_DATE: "1970-01-01T00:00:00Z",
} as const;

interface ReflogEntry {
  sha: string;
  /** Unix seconds. */
  at: number;
  subject: string;
}

async function git(cwd: string, args: string[], env: Record<string, string> = READ_ONLY) {
  return runGitCommand(args, { cwd, envOverlay: env, acceptExitCodes: [0, 1, 128] });
}

/** HEAD's reflog, newest first. */
export function reflogOf(stdout: string): ReflogEntry[] {
  return stdout.split("\n").flatMap((line) => {
    const found = /^([0-9a-f]{40})\tHEAD@\{(\d+)\}\t(.*)$/.exec(line);
    return found?.[1] && found[2]
      ? [{ sha: found[1], at: Number(found[2]), subject: found[3] ?? "" }]
      : [];
  });
}

/** The commit the session's work starts from before merges: HEAD at `at`, or after the last branch switch since. */
export function startOf(entries: readonly ReflogEntry[], atSeconds: number): string | null {
  const switched = entries.find(
    (entry) => entry.at > atSeconds && entry.subject.startsWith("checkout: moving from "),
  );
  if (switched) return switched.sha;
  return entries.find((entry) => entry.at <= atSeconds)?.sha ?? null;
}

/** The commit a session's diff in `cwd` starts from, for a session that first touched it at `at`. */
export async function resolveSessionBase(cwd: string, at: Date): Promise<string | null> {
  const seconds = Math.floor(at.getTime() / 1000);
  const reflog = await git(cwd, [
    "reflog",
    "show",
    "-n",
    "5000",
    "--date=unix",
    "--format=%H%x09%gd%x09%gs",
    "HEAD",
  ]);
  let start = startOf(reflogOf(String(reflog.stdout)), seconds);
  if (!start) {
    const history = await git(cwd, [
      "rev-list",
      "-1",
      "--first-parent",
      `--before=${seconds}`,
      "HEAD",
    ]);
    start = String(history.stdout).trim() || null;
  }
  if (!start) return null;
  return (await mergedBase(cwd, start)) ?? start;
}

async function revision(cwd: string, name: string): Promise<string | null> {
  const found = await git(cwd, ["rev-parse", "-q", "--verify", name]);
  return found.exitCode === 0 ? String(found.stdout).trim() || null : null;
}

/** `start` merged with `upstream` as a commit object; a conflicted merge only when `keepConflicts`. */
async function mergeTreeCommit(
  cwd: string,
  input: { start: string; upstream: string; keepConflicts: boolean },
): Promise<string | null> {
  const tree = await git(cwd, [
    "merge-tree",
    "--write-tree",
    "--no-messages",
    input.start,
    input.upstream,
  ]);
  const treeId = String(tree.stdout).split("\n")[0]?.trim();
  const usable = tree.exitCode === 0 || (input.keepConflicts && tree.exitCode === 1);
  if (!usable || !treeId || !/^[0-9a-f]{40,64}$/.test(treeId)) return null;
  const commit = await git(
    cwd,
    ["commit-tree", treeId, "-p", input.start, "-m", "Groupon Desk: a session's base"],
    { ...READ_ONLY, ...FIXED_IDENTITY },
  );
  return String(commit.stdout).trim() || null;
}

/** `start` with what the newest merge since then brought in; null when HEAD took no merge since. */
async function mergedBase(cwd: string, start: string): Promise<string | null> {
  const pending = await revision(cwd, "MERGE_HEAD");
  if (pending) return mergeTreeCommit(cwd, { start, upstream: pending, keepConflicts: true });
  const merges = await git(cwd, ["rev-list", "--first-parent", "--merges", `${start}..HEAD`]);
  const merge = String(merges.stdout).split("\n")[0]?.trim();
  if (!merge) return null;
  const upstream = await revision(cwd, `${merge}^2`);
  if (!upstream) return merge;
  return (await mergeTreeCommit(cwd, { start, upstream, keepConflicts: false })) ?? merge;
}
