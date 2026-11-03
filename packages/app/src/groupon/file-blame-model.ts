// Added for Groupon Desk (fork of Paseo, Apache-2.0): who last changed each line of a file, as the daemon reads it with `git blame`, for the file viewer's blame bar.

import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { GROUPON_DESK_RPC_PLUGIN_ID } from "./train-archived-model";

const FILE_BLAME_RPC = "groupon-desk.git.blame";

export interface BlameCommit {
  sha: string;
  author: string;
  email: string;
  at: string;
  subject: string;
  uncommitted: boolean;
}

export interface BlameRange {
  start: number;
  count: number;
  sha: string;
}

export type FileBlame =
  | { state: "blamed"; commits: Record<string, BlameCommit>; ranges: BlameRange[] }
  | { state: "untracked" }
  | { state: "outside-git" };

export interface FileAuthor {
  /** Null for the lines not committed yet. */
  name: string | null;
  lines: number;
  share: number;
}

const text = (value: unknown) => (typeof value === "string" ? value : "");
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function commitOf(value: unknown): BlameCommit | null {
  if (!isRecord(value) || typeof value.sha !== "string") return null;
  return {
    sha: value.sha,
    author: text(value.author),
    email: text(value.email),
    at: text(value.at),
    subject: text(value.subject),
    uncommitted: value.uncommitted === true,
  };
}

function rangeOf(value: unknown): BlameRange | null {
  if (!isRecord(value)) return null;
  const { start, count, sha } = value;
  return typeof start === "number" && typeof count === "number" && typeof sha === "string"
    ? { start, count, sha }
    : null;
}

/** The daemon's answer, checked; null when it holds no blame the bar can show. */
export function fileBlameOf(answer: unknown): FileBlame | null {
  const blame = isRecord(answer) ? answer.blame : null;
  if (!isRecord(blame)) return null;
  if (blame.state === "untracked" || blame.state === "outside-git") return { state: blame.state };
  if (blame.state !== "blamed" || !Array.isArray(blame.commits) || !Array.isArray(blame.ranges)) {
    return null;
  }
  const commits: Record<string, BlameCommit> = {};
  for (const commit of blame.commits.map(commitOf)) {
    if (commit) commits[commit.sha] = commit;
  }
  const ranges = blame.ranges
    .map(rangeOf)
    .filter((range): range is BlameRange => range !== null && range.sha in commits)
    .sort((a, b) => a.start - b.start);
  return { state: "blamed", commits, ranges };
}

/** Null from a daemon that predates the read, so the bar stays away there. */
export async function readFileBlame(
  client: Pick<DaemonClient, "invokePluginRpc">,
  workspaceId: string,
  path: string,
): Promise<FileBlame | null> {
  try {
    return fileBlameOf(
      await client.invokePluginRpc(GROUPON_DESK_RPC_PLUGIN_ID, FILE_BLAME_RPC, {
        workspaceId,
        path,
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unknown Groupon Desk method")) {
      return null;
    }
    throw error;
  }
}

/** The file's path inside the workspace, or null for a file outside it. */
export function workspaceRelativePath(directory: string, filePath: string): string | null {
  const root = directory.replace(/\/+$/, "");
  if (!root || !filePath.startsWith(`${root}/`)) return null;
  const relative = filePath.slice(root.length + 1);
  return relative === "" ? null : relative;
}

export function commitAtLine(
  blame: Extract<FileBlame, { state: "blamed" }>,
  line: number,
): BlameCommit | null {
  let low = 0;
  let high = blame.ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const range = blame.ranges[middle];
    if (!range) return null;
    if (line < range.start) high = middle - 1;
    else if (line >= range.start + range.count) low = middle + 1;
    else return blame.commits[range.sha] ?? null;
  }
  return null;
}

/** The file's most recent commit: what the bar shows when no line is chosen. */
export function newestCommit(blame: Extract<FileBlame, { state: "blamed" }>): BlameCommit | null {
  let newest: BlameCommit | null = null;
  for (const commit of Object.values(blame.commits)) {
    if (commit.uncommitted) continue;
    if (!newest || commit.at > newest.at) newest = commit;
  }
  return newest;
}

/** Who wrote how much of the file, by lines, most first; not committed lines count as one author. */
export function fileAuthors(blame: Extract<FileBlame, { state: "blamed" }>): FileAuthor[] {
  const lines = new Map<string | null, number>();
  let total = 0;
  for (const range of blame.ranges) {
    const commit = blame.commits[range.sha];
    if (!commit) continue;
    const name = commit.uncommitted ? null : commit.author;
    lines.set(name, (lines.get(name) ?? 0) + range.count);
    total += range.count;
  }
  return [...lines.entries()]
    .map(([name, count]) => ({ name, lines: count, share: total ? count / total : 0 }))
    .sort((a, b) => b.lines - a.lines);
}

/** The change request a commit's subject names: a squash's `(#123)` or a merge's `#123`. */
export function changeRequestNumberOf(subject: string): number | null {
  const match =
    /\(#(\d+)\)\s*$/.exec(subject) ?? /^Merge (?:pull|merge) request #(\d+)/.exec(subject);
  return match?.[1] ? Number(match[1]) : null;
}
