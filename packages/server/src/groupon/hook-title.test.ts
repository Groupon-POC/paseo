// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for carrying a hook's session title onto its chat.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  configDirOf,
  hookTitleLedger,
  lastCustomTitleOf,
  readTranscriptTail,
} from "./hook-title.js";

const homes: string[] = [];
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

const line = (value: object) => JSON.stringify(value);

describe("a hook's session title", () => {
  test("is the last custom-title record, a sidechain's or a quoting prompt's left out", () => {
    const text = [
      line({ type: "custom-title", customTitle: "Old name" }),
      line({ type: "user", message: { content: 'the "custom-title" record' } }),
      line({ type: "custom-title", customTitle: "Review: staging deploy", isSidechain: false }),
      line({ type: "custom-title", customTitle: "A subagent's", isSidechain: true }),
    ].join("\n");

    expect(lastCustomTitleOf(text)).toBe("Review: staging deploy");
    expect(lastCustomTitleOf(line({ type: "user" }))).toBeNull();
  });

  test("reads the transcript's end and remembers what it carried", async () => {
    const home = mkdtempSync(join(tmpdir(), "hook-title-"));
    homes.push(home);
    const transcript = join(home, "s.jsonl");
    writeFileSync(
      transcript,
      `${"x".repeat(2000)}\n${line({ type: "custom-title", customTitle: "Kept" })}\n`,
    );
    const ledger = hookTitleLedger(home);

    expect(lastCustomTitleOf((await readTranscriptTail(transcript, 300)) ?? "")).toBe("Kept");
    expect(await readTranscriptTail(join(home, "missing.jsonl"))).toBeNull();
    expect(await ledger.applied("a1")).toBeNull();
    await ledger.remember("a1", "Kept");
    expect(await ledger.applied("a1")).toBe("Kept");
    expect(
      configDirOf("/x/claude --flag HOME=/u CLAUDE_CONFIG_DIR=/u/.groupon/claude-a TERM=x"),
    ).toBe("/u/.groupon/claude-a");
    expect(configDirOf("HOME=/u")).toBeNull();
  });
});
