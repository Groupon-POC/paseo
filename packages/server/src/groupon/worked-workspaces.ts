// Added for Groupon Desk (fork of Paseo, Apache-2.0): the workspaces whose chats worked on their checkout's branch, so a pull request shows on those and not on every chat sharing the checkout.

import { isAbsolute, relative, resolve } from "node:path";

/** The Groupon Desk plugin RPC the window reads: answered `{ workspaceIds }`. */
export const WORKED_WORKSPACES_RPC = "groupon-desk.workspaces.worked";

// A commit, a push, or a pull request opened from a shell.
const BRANCH_WORK = /\bgit\b[^\n;&|]*?\s(commit|push)\b|\bgh\s+pr\s+create\b/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function inside(dir: string, path: string): boolean {
  const rel = relative(dir, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** Whether a chat's timeline edited a file in `dir`, or committed, pushed or opened a pull request from it. */
export function workedIn(rows: readonly { item: unknown }[], dir: string): boolean {
  return rows.some(({ item }) => {
    if (!isRecord(item) || item.type !== "tool_call" || item.status !== "completed") return false;
    const detail = item.detail;
    if (!isRecord(detail)) return false;
    if (
      (detail.type === "edit" || detail.type === "write") &&
      typeof detail.filePath === "string"
    ) {
      return inside(dir, resolve(dir, detail.filePath));
    }
    if (detail.type !== "shell" || typeof detail.command !== "string") return false;
    const cwd = typeof detail.cwd === "string" ? resolve(dir, detail.cwd) : dir;
    return inside(dir, cwd) && BRANCH_WORK.test(detail.command);
  });
}
