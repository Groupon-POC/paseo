// Added for Groupon Desk (fork of Paseo, Apache-2.0): what an agent session changed, per git repository, from its own edits.

/**
 * The changes a workspace's sessions made: the files their Edit and Write tool calls touched,
 * grouped by git repository (a session may work in several), each repository diffed from where
 * HEAD was when the session first touched it to the working tree. The session's commits and its
 * later shell edits of those files are in it; other files and other people's work are not.
 *
 * Responsibilities:
 * - `sessionEditsOf`: the edited files of a session's timeline, absolute, with when they were edited
 * - `readSessionChanges`: those files grouped by repository, each with its baseline and its diff
 * - `sessionRootHolding`: which of those repositories holds a path, so the window may read it
 *
 * A session that changes files from a shell (a script, `git commit`) shows them too
 * (`shellEditsOf`): in each repository it edited or runs in, what its commits since it started
 * there changed, and the uncommitted files that changed after that.
 *
 * Constraints:
 * - A file outside any git repository has no diff and is left out
 * - Only completed edits count: a failed or cancelled Write changed nothing
 */

import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { ParsedDiffFile } from "../server/utils/diff-highlighter.js";

/** The Groupon Desk plugin RPC the window calls: `{ workspaceId }`, answered `{ repos }`. */
export const SESSION_CHANGES_RPC = "groupon-desk.session.changes";

/** Which part of the sessions' changes the window asks for: everything, their commits, or what is not committed. */
export type SessionChangesMode = "all" | "committed" | "uncommitted";

export function sessionChangesModeOf(value: unknown): SessionChangesMode {
  return value === "committed" || value === "uncommitted" ? value : "all";
}

/** The diff of a repository's session files for a mode: from the session's base, to HEAD or to the working tree. */
export function sessionDiffRange(
  mode: SessionChangesMode,
  baseCommit: string,
  paths: readonly string[],
): { baseCommit: string; paths: readonly string[]; targetRef?: string } {
  if (mode === "committed") return { baseCommit, paths, targetRef: "HEAD" };
  if (mode === "uncommitted") return { baseCommit: "HEAD", paths };
  return { baseCommit, paths };
}

export interface SessionEdit {
  /** Absolute. */
  path: string;
  at: Date;
}

export interface SessionChangesRepo {
  /** The worktree root the files are in. */
  root: string;
  /** The repository's name as people know it (its main checkout's folder). */
  name: string;
  branch: string | null;
  /** The commit HEAD pointed at when the session first edited a file here; null: none known. */
  baseline: string | null;
  files: ParsedDiffFile[];
  diffTooLarge: boolean;
  error: string | null;
}

export interface SessionChangesDeps {
  /** The worktree root a folder belongs to; null outside git. */
  worktreeRootOf(dir: string): Promise<string | null>;
  nameOf(root: string): Promise<string>;
  branchOf(root: string): Promise<string | null>;
  headAt(root: string, at: Date): Promise<string | null>;
  diffSince(
    root: string,
    baseCommit: string,
    paths: readonly string[],
  ): Promise<{ structured?: ParsedDiffFile[]; diffTooLarge?: boolean }>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The files a session's completed Edit and Write calls touched, absolute, each with its time. */
export function sessionEditsOf(
  rows: readonly { timestamp: string; item: unknown }[],
  cwd: string,
): SessionEdit[] {
  const edits: SessionEdit[] = [];
  for (const row of rows) {
    const item = row.item;
    if (!isRecord(item) || item.type !== "tool_call" || item.status !== "completed") continue;
    const detail = item.detail;
    if (!isRecord(detail) || (detail.type !== "edit" && detail.type !== "write")) continue;
    if (typeof detail.filePath !== "string" || detail.filePath.length === 0) continue;
    const at = new Date(row.timestamp);
    if (Number.isNaN(at.getTime())) continue;
    edits.push({
      path: isAbsolute(detail.filePath) ? detail.filePath : resolve(cwd, detail.filePath),
      at,
    });
  }
  return edits;
}

/** When one of the session's shell calls ran: from the row before it (the agent issued it) to its end. */
export interface ShellWindow {
  from: Date;
  to: Date;
}

/** Slack after a call's end for a file's write and a commit's time to land. */
const WINDOW_SLACK_MS = 5_000;
/** A first call with no row before it reaches back this far. */
const FIRST_WINDOW_MS = 10 * 60_000;

/** The windows the session's own shell calls ran in, a running call's up to `now`. */
export function shellWindowsOf(
  rows: readonly { timestamp: string; item: unknown }[],
  now: Date,
): ShellWindow[] {
  const windows: ShellWindow[] = [];
  let previous: Date | null = null;
  for (const row of rows) {
    const at = new Date(row.timestamp);
    if (Number.isNaN(at.getTime())) continue;
    const item = row.item;
    const shell =
      isRecord(item) &&
      item.type === "tool_call" &&
      isRecord(item.detail) &&
      item.detail.type === "shell";
    if (
      shell &&
      (item.status === "completed" || item.status === "failed" || item.status === "running")
    ) {
      const end = item.status === "running" ? now : at;
      windows.push({
        from: previous ?? new Date(at.getTime() - FIRST_WINDOW_MS),
        to: new Date(end.getTime() + WINDOW_SLACK_MS),
      });
    }
    previous = at;
  }
  return windows;
}

const within = (at: Date, windows: readonly ShellWindow[]) =>
  windows.some((window) => at >= window.from && at <= window.to);

export interface ShellChangeDeps {
  worktreeRootOf(dir: string): Promise<string | null>;
  /** The commits on HEAD since then, merges left out, each with its time and files relative to the root. */
  commitsSince(root: string, since: Date): Promise<{ at: Date; files: string[] }[]>;
  /** The worktree's uncommitted files, relative to the root. */
  uncommitted(root: string): Promise<string[]>;
  /** When a file last changed; null when it is gone. */
  modifiedAt(path: string): Promise<Date | null>;
}

/** The most uncommitted files looked at in one repository. */
const UNCOMMITTED_LIMIT = 400;

/**
 * The files a session changed without Edit or Write (a script, `sed`, `git commit` from a shell),
 * in the repositories it edited and the folders it runs in: what the commits on HEAD made while
 * one of its own shell calls ran changed, and the uncommitted files that changed then. Another
 * session working in the same checkout at other times is never counted as this one. Each file
 * counts from the session's start there, as an Edit there would.
 */
export async function shellEditsOf(
  input: {
    edits: readonly SessionEdit[];
    startedIn: readonly { dir: string; at: Date }[];
    windows: readonly ShellWindow[];
  },
  deps: ShellChangeDeps,
): Promise<SessionEdit[]> {
  if (input.windows.length === 0) return [];
  const sinceByRoot = new Map<string, Date>();
  const starts = [
    ...input.edits.map((edit) => ({ dir: dirname(edit.path), at: edit.at })),
    ...input.startedIn,
  ];
  for (const start of starts) {
    const root = await deps.worktreeRootOf(start.dir).catch(() => null);
    if (!root) continue;
    const since = sinceByRoot.get(root);
    if (!since || start.at < since) sinceByRoot.set(root, start.at);
  }
  const found = await Promise.all(
    [...sinceByRoot.entries()].map(async ([root, since]) => {
      const [commits, uncommitted] = await Promise.all([
        deps.commitsSince(root, since).catch(() => []),
        deps.uncommitted(root).catch(() => []),
      ]);
      const committed = commits
        .filter((commit) => within(commit.at, input.windows))
        .flatMap((commit) => commit.files);
      const changedSince = await Promise.all(
        uncommitted.slice(0, UNCOMMITTED_LIMIT).map(async (file) => {
          const at = await deps.modifiedAt(resolve(root, file)).catch(() => null);
          return at && at >= since && within(at, input.windows) ? file : null;
        }),
      );
      const files = new Set([...committed, ...changedSince.filter((file) => file !== null)]);
      return [...files].map((file) => ({ path: resolve(root, file), at: since }));
    }),
  );
  return found.flat();
}

/**
 * The worktree root, among the repositories a session edited, that holds `absolutePath`; null when
 * none does. What lets the window read a file the session edited outside its workspace.
 */
export async function sessionRootHolding(
  edits: readonly SessionEdit[],
  absolutePath: string,
  worktreeRootOf: (dir: string) => Promise<string | null>,
): Promise<string | null> {
  const dirs = new Set(edits.map((edit) => dirname(edit.path)));
  const roots = new Set<string>();
  for (const dir of dirs) {
    const root = await worktreeRootOf(dir).catch(() => null);
    if (root) roots.add(root);
  }
  for (const root of roots) {
    const rel = relative(root, absolutePath);
    if (rel !== "" && !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel)) return root;
  }
  return null;
}

/** The edits grouped by repository, the first-touched repository first, each diffed from its baseline. */
export async function readSessionChanges(
  edits: readonly SessionEdit[],
  deps: SessionChangesDeps,
): Promise<{ repos: SessionChangesRepo[] }> {
  const rootByDir = new Map<string, Promise<string | null>>();
  const byRoot = new Map<string, { firstAt: Date; paths: Set<string> }>();
  for (const edit of edits) {
    const dir = dirname(edit.path);
    let root = rootByDir.get(dir);
    if (!root) {
      root = deps.worktreeRootOf(dir).catch(() => null);
      rootByDir.set(dir, root);
    }
    const resolved = await root;
    if (!resolved) continue;
    const path = relative(resolved, edit.path);
    if (path.startsWith(`..${sep}`) || isAbsolute(path)) continue;
    const group = byRoot.get(resolved) ?? { firstAt: edit.at, paths: new Set<string>() };
    if (edit.at < group.firstAt) group.firstAt = edit.at;
    group.paths.add(path.split(sep).join("/"));
    byRoot.set(resolved, group);
  }

  const groups = [...byRoot.entries()].sort(
    (a, b) => a[1].firstAt.getTime() - b[1].firstAt.getTime(),
  );
  const repos = await Promise.all(
    groups.map(async ([root, group]): Promise<SessionChangesRepo> => {
      const [name, branch, baseline] = await Promise.all([
        deps.nameOf(root),
        deps.branchOf(root).catch(() => null),
        deps.headAt(root, group.firstAt).catch(() => null),
      ]);
      const paths = [...group.paths].sort();
      try {
        const diff = await deps.diffSince(root, baseline ?? "HEAD", paths);
        return {
          root,
          name,
          branch,
          baseline,
          files: diff.structured ?? [],
          diffTooLarge: diff.diffTooLarge === true,
          error: null,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { root, name, branch, baseline, files: [], diffTooLarge: false, error: message };
      }
    }),
  );
  return { repos };
}
