// Added for Groupon Desk (fork of Paseo, Apache-2.0): who last changed each line of a workspace file, read with `git blame`, for the file viewer's blame bar.

import { isAbsolute } from "node:path";

/** The Groupon Desk plugin RPC the window calls: `{ workspaceId, path }`, answered `{ blame }`. */
export const FILE_BLAME_RPC = "groupon-desk.git.blame";

const UNCOMMITTED_SHA = /^0{40}$/;

export interface BlameCommit {
  sha: string;
  author: string;
  email: string;
  /** ISO 8601; the moment git blamed a not committed line for those. */
  at: string;
  subject: string;
  uncommitted: boolean;
}

/** Lines `start` to `start + count - 1` (1-based) last changed in commit `sha`. */
export interface BlameRange {
  start: number;
  count: number;
  sha: string;
}

export type FileBlame =
  | { state: "blamed"; commits: BlameCommit[]; ranges: BlameRange[] }
  /** The file is inside a repository but not committed yet. */
  | { state: "untracked" }
  | { state: "outside-git" };

/** A request from the window; the path crosses a local boundary, so it must stay inside the workspace. */
export function fileBlameRequestOf(input: unknown): { workspaceId: string; path: string } {
  const fields =
    typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const { workspaceId, path } = fields;
  if (typeof workspaceId !== "string" || workspaceId.trim() === "") {
    throw new Error("workspaceId is required");
  }
  if (
    typeof path !== "string" ||
    path === "" ||
    isAbsolute(path) ||
    path.split(/[\\/]/).includes("..")
  ) {
    throw new Error("path must be relative to the workspace");
  }
  return { workspaceId, path };
}

export function fileBlameArgs(path: string): string[] {
  return ["blame", "--porcelain", "--", path];
}

/** What `git blame` printed with `fileBlameArgs`, or why there is nothing to blame. */
export function fileBlameOf(result: {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}): FileBlame {
  if (result.exitCode !== 0) return notBlamed(result.stderr, result.exitCode);
  const commits = new Map<string, BlameCommit>();
  const ranges: BlameRange[] = [];
  let current: BlameCommit | null = null;
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("\t")) continue;
    const header = /^([0-9a-f]{40}) \d+ (\d+)/.exec(line);
    if (header) {
      const [, sha = "", finalLine = "0"] = header;
      current = commits.get(sha) ?? null;
      if (!current) {
        current = {
          sha,
          author: "",
          email: "",
          at: "",
          subject: "",
          uncommitted: UNCOMMITTED_SHA.test(sha),
        };
        commits.set(sha, current);
      }
      const start = Number(finalLine);
      const last = ranges.at(-1);
      if (last && last.sha === sha && last.start + last.count === start) last.count += 1;
      else ranges.push({ start, count: 1, sha });
      continue;
    }
    if (current) readHeaderField(current, line);
  }
  for (const commit of commits.values()) {
    if (commit.uncommitted) {
      commit.author = "";
      commit.email = "";
      commit.subject = "";
    }
  }
  return { state: "blamed", commits: [...commits.values()], ranges };
}

function notBlamed(stderr: string, exitCode: number | null): FileBlame {
  if (/not a git repository/i.test(stderr)) return { state: "outside-git" };
  if (/no such path .* in HEAD|does not have any commits/i.test(stderr)) {
    return { state: "untracked" };
  }
  throw new Error(stderr.trim() || `git blame exited with ${exitCode}`);
}

function readHeaderField(commit: BlameCommit, line: string): void {
  if (line.startsWith("author ")) commit.author = line.slice(7);
  else if (line.startsWith("author-mail ")) commit.email = line.slice(12).replace(/^<|>$/g, "");
  else if (line.startsWith("author-time ")) {
    commit.at = new Date(Number(line.slice(12)) * 1000).toISOString();
  } else if (line.startsWith("summary ")) commit.subject = line.slice(8);
}
