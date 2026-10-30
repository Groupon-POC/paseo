// Added for Groupon Desk (fork of Paseo, Apache-2.0): what a shell call an agent ran in the background printed, read from the file Claude Code writes it to, for the chat's git timeline.

import { open, realpath } from "node:fs/promises";
import { userInfo } from "node:os";

/** The Groupon Desk plugin RPC the window calls: `{ path }`, answered `{ output, exitCode }`. */
export const BACKGROUND_OUTPUT_RPC = "groupon-desk.shell.output";

/** A background task's output file: `<tmp>/claude-<uid>/<project>/<session>/tasks/<id>.output`. */
const TASK_OUTPUT = /^\/(?:private\/)?tmp\/claude-(\d+)\/[^/]+\/[^/]+\/tasks\/[\w-]+\.output$/;
const EXITED = /\n?\[exited with code (\d+)\]\s*$/;
/** Only the end of a long output is read; git's lines come last. */
const MAX_BYTES = 64 * 1024;

/** A request from the window; it crosses a local boundary, so the path must be a task output file of this user. */
export function backgroundOutputRequestOf(input: unknown): { path: string } {
  const path =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>).path
      : undefined;
  if (typeof path !== "string" || !isOwnTaskOutput(path)) {
    throw new Error("path must be a Claude Code background task's output file");
  }
  return { path };
}

function isOwnTaskOutput(path: string): boolean {
  const found = TASK_OUTPUT.exec(path);
  return (
    found !== null &&
    Number(found[1]) === userInfo().uid &&
    !path.split("/").some((part) => part === "." || part === "..")
  );
}

/** The output so far, and the exit code once the task has finished (null while it runs). */
export function backgroundOutputOf(text: string): { output: string; exitCode: number | null } {
  const exited = EXITED.exec(text);
  return exited
    ? { output: text.slice(0, exited.index), exitCode: Number(exited[1]) }
    : { output: text, exitCode: null };
}

export async function readBackgroundOutput(
  path: string,
): Promise<{ output: string; exitCode: number | null }> {
  const real = await realpath(path);
  if (!isOwnTaskOutput(real)) throw new Error("path leads outside Claude Code's task outputs");
  const file = await open(real, "r");
  try {
    const { size } = await file.stat();
    const start = Math.max(0, size - MAX_BYTES);
    const buffer = Buffer.alloc(size - start);
    await file.read(buffer, 0, buffer.length, start);
    return backgroundOutputOf(buffer.toString("utf8"));
  } finally {
    await file.close();
  }
}
