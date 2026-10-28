// Added for Groupon Desk (fork of Paseo, Apache-2.0): a title a hook or /rename gives a running Claude session, carried onto its chat at the end of a turn.

import { open, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const TAIL_BYTES = 512 * 1024;
const CUSTOM_TITLE = '"custom-title"';

/** The end of a transcript, where Claude Code re-writes the current title on every save; null without one. */
export async function readTranscriptTail(path: string, bytes = TAIL_BYTES): Promise<string | null> {
  try {
    const file = await open(path, "r");
    try {
      const { size } = await file.stat();
      const length = Math.min(size, bytes);
      const buffer = Buffer.alloc(length);
      await file.read(buffer, 0, length, size - length);
      return buffer.toString("utf8");
    } finally {
      await file.close();
    }
  } catch {
    return null;
  }
}

/** The last `custom-title` record's title in transcript text, sidechains left out. */
export function lastCustomTitleOf(text: string): string | null {
  let at = text.lastIndexOf(CUSTOM_TITLE);
  while (at >= 0) {
    const start = text.lastIndexOf("\n", at) + 1;
    const end = text.indexOf("\n", at);
    const line = text.slice(start, end === -1 ? undefined : end).trim();
    const title = titleOfLine(line);
    if (title) return title;
    at = at === 0 ? -1 : text.lastIndexOf(CUSTOM_TITLE, at - 1);
  }
  return null;
}

function titleOfLine(line: string): string | null {
  try {
    const entry: unknown = JSON.parse(line);
    if (typeof entry !== "object" || entry === null) return null;
    const record = entry as { type?: unknown; customTitle?: unknown; isSidechain?: unknown };
    if (record.type !== "custom-title" || record.isSidechain === true) return null;
    return typeof record.customTitle === "string" && record.customTitle.trim()
      ? record.customTitle.trim()
      : null;
  } catch {
    return null;
  }
}

/** `CLAUDE_CONFIG_DIR` from a process's `ps -wwE` line; null when it is not set. */
export function configDirOf(environment: string): string | null {
  return /(?:^|\s)CLAUDE_CONFIG_DIR=(\S+)/.exec(environment)?.[1] ?? null;
}

/** The title last carried onto each chat, so a restart never re-applies one over the person's own rename. */
export function hookTitleLedger(paseoHome: string) {
  const path = join(paseoHome, "groupon", "hook-titles.json");
  const read = async (): Promise<Record<string, string>> => {
    try {
      const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
      return typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, string>)
        : {};
    } catch {
      return {};
    }
  };
  return {
    async applied(agentId: string): Promise<string | null> {
      return (await read())[agentId] ?? null;
    },
    async remember(agentId: string, title: string): Promise<void> {
      const next = { ...(await read()), [agentId]: title };
      await mkdir(dirname(path), { recursive: true });
      await writeFile(`${path}.tmp`, JSON.stringify(next));
      await rename(`${path}.tmp`, path);
    },
  };
}
