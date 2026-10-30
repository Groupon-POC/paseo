// Added for Groupon Desk (fork of Paseo, Apache-2.0): what a commit or a push an agent made holds, read from git for the chat's git timeline.

import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

/** The Groupon Desk plugin RPC the window calls: `{ cwd, revision }`, answered `{ commits }`. */
export const GIT_DETAILS_RPC = "groupon-desk.git.details";

const SHA = /^[0-9a-f]{7,40}$/;
const RANGE = /^[0-9a-f]{7,40}\.\.\.?[0-9a-f]{7,40}$/;
/** A push reads at most this many commits; a commit at most this many files. */
const MAX_COMMITS = 20;
const MAX_FILES = 60;

export interface GitFileChange {
  path: string;
  /** Null for a binary file. */
  additions: number | null;
  deletions: number | null;
}

export interface GitCommitDetails {
  sha: string;
  subject: string;
  body: string;
  author: string;
  at: string;
  files: GitFileChange[];
  /** Files left out past the limit. */
  moreFiles: number;
}

/** A request from the window; it crosses a local boundary, so the folder and the revision are checked. */
export function gitDetailsRequestOf(input: unknown): { cwd: string; revision: string } {
  const fields =
    typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const { revision } = fields;
  // A shell's `cd ~/...` reaches the window as written; the home folder is this Mac's.
  const cwd =
    typeof fields.cwd === "string" && fields.cwd.startsWith("~/")
      ? join(homedir(), fields.cwd.slice(2))
      : fields.cwd;
  if (typeof cwd !== "string" || !isAbsolute(cwd)) throw new Error("cwd must be an absolute path");
  if (typeof revision !== "string" || !(SHA.test(revision) || RANGE.test(revision))) {
    throw new Error("revision must be a commit's sha or a range a..b");
  }
  return { cwd, revision };
}

/** `git log` arguments for one commit, or for the commits of a range; a merge shows what it brought in. */
export function gitDetailsArgs(revision: string): string[] {
  const commits = RANGE.test(revision)
    ? [`--max-count=${MAX_COMMITS}`, revision]
    : ["-1", revision];
  return [
    "log",
    "--no-color",
    "--numstat",
    "--diff-merges=first-parent",
    "--format=%x1e%H%x1f%s%x1f%b%x1f%an%x1f%aI%x1f",
    ...commits,
  ];
}

/** The commits `git log` printed with `gitDetailsArgs`. */
export function gitDetailsOf(stdout: string): GitCommitDetails[] {
  return stdout
    .split("\x1e")
    .filter((chunk) => chunk.trim() !== "")
    .map((chunk) => {
      const [sha = "", subject = "", body = "", author = "", at = "", numstat = ""] =
        chunk.split("\x1f");
      const files = numstat
        .split("\n")
        .map((line) => line.split("\t"))
        .filter((parts) => parts.length >= 3 && parts[2])
        .map(([added, removed, ...path]) => ({
          path: path.join("\t"),
          additions: added === "-" ? null : Number(added),
          deletions: removed === "-" ? null : Number(removed),
        }));
      return {
        sha: sha.trim(),
        subject: subject.trim(),
        body: body.trim(),
        author: author.trim(),
        at: at.trim(),
        files: files.slice(0, MAX_FILES),
        moreFiles: Math.max(0, files.length - MAX_FILES),
      };
    });
}
