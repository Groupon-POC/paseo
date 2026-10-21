// Added for Groupon Desk (fork of Paseo, Apache-2.0): the tools a Mac lacks, as the window says so.
/**
 * Tests for which missing tools the window shows, their labels and their sentences.
 *
 * Covers: packages/app/src/groupon/missing-tools-model.ts
 */
import { describe, expect, it } from "vitest";
import { missingToolFixes, missingToolLabel, shownMissingTools } from "./missing-tools-model";

describe("shownMissingTools", () => {
  it("shows gh, git and claude as reported, in a fixed order, and no codex", () => {
    expect(shownMissingTools(["claude", "git", "gh", "codex"], false)).toEqual([
      "gh",
      "git",
      "claude",
    ]);
  });

  it("shows codex only while a session uses it", () => {
    expect(shownMissingTools(["codex"], false)).toEqual([]);
    expect(shownMissingTools(["codex"], true)).toEqual(["codex"]);
  });

  it("shows nothing for an empty, null or absent list", () => {
    expect(shownMissingTools([], true)).toEqual([]);
    expect(shownMissingTools(null, true)).toEqual([]);
    expect(shownMissingTools(undefined, true)).toEqual([]);
  });
});

describe("the words", () => {
  it("labels a tool 'gh missing'", () => {
    expect(missingToolLabel("gh")).toBe("gh missing");
  });

  it("gives the one sentence for one tool, without a dash", () => {
    const [sentence] = missingToolFixes(["gh"]);
    expect(sentence).toBe("Install it on that Mac: brew install gh, then gh auth login");
    expect(sentence).not.toMatch(/[–—]/);
  });

  it("gives nothing for no tool", () => {
    expect(missingToolFixes([])).toEqual([]);
  });
});
