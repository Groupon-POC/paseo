// Added for Groupon Desk (fork of Paseo, Apache-2.0): the repository's standard against this Mac's override.
import { describe, expect, it } from "vitest";
import type { ProjectSettingsAnswer } from "./desk-plugin-rpc";
import {
  commandText,
  hasOverrides,
  hasRepositoryStandard,
  overridesOf,
  standardCaption,
} from "./repository-settings-model";

/** The monorepo's committed shim, word for word. */
const SHIM = {
  worktree: { setup: "groupon desk repo setup", teardown: "groupon desk repo archive" },
  scripts: {
    core: { command: "groupon desk repo run core" },
    internal: { command: "groupon desk repo run internal" },
  },
};

const ANSWER: ProjectSettingsAnswer = {
  settings: {
    setup: "pnpm install --frozen-lockfile && pnpm checkout:prepare",
    archive: null,
    runMode: "concurrent",
    run: [{ id: "core", command: "pnpm backend:core", icon: "server", isDefault: true }],
    prompts: { create_pr: "Open the PR." },
    targetBranch: "staging",
    deleteBranchOnArchive: false,
    envRequired: [],
  },
  source: "default-branch",
  branch: "staging",
  fileUrl: "https://github.com/groupon2/engineering-development/blob/staging/.groupon/desk.toml",
  fetchedAt: null,
  problem: null,
  hasPaseoJson: true,
};

describe("the repository's standard", () => {
  it("decides when the default branch carries the desk file or Paseo's own file", () => {
    expect(hasRepositoryStandard(ANSWER)).toBe(true);
    expect(hasRepositoryStandard({ ...ANSWER, settings: null, hasPaseoJson: true })).toBe(true);
    expect(hasRepositoryStandard({ ...ANSWER, settings: null, hasPaseoJson: false })).toBe(false);
    expect(hasRepositoryStandard(undefined)).toBe(false);
  });

  it("reads the shim as routing, not as an override", () => {
    expect(overridesOf(SHIM)).toEqual({
      setup: null,
      teardown: null,
      scripts: [],
      commitMessages: null,
      pullRequests: null,
      branchNames: null,
    });
    expect(hasOverrides(overridesOf(SHIM))).toBe(false);
    expect(hasOverrides(overridesOf(null))).toBe(false);
  });

  it("marks what this checkout's paseo.json changes beyond the shim", () => {
    const local = {
      ...SHIM,
      worktree: { setup: ["npm ci", "make"], teardown: "groupon desk repo archive" },
      scripts: {
        ...SHIM.scripts,
        core: { command: "pnpm backend:core --verbose" },
        docs: { command: "pnpm docs" },
      },
      metadataGeneration: { commitMessage: { instructions: "Short subjects." } },
    };
    const overrides = overridesOf(local);
    expect(overrides.setup).toBe("npm ci && make");
    expect(overrides.teardown).toBeNull();
    expect(overrides.scripts).toEqual([
      { id: "core", command: "pnpm backend:core --verbose" },
      { id: "docs", command: "pnpm docs" },
    ]);
    expect(overrides.commitMessages).toBe("Short subjects.");
    expect(hasOverrides(overrides)).toBe(true);
  });

  it("reads a lifecycle command in either of Paseo's shapes", () => {
    expect(commandText(" make ")).toBe("make");
    expect(commandText(["a", " ", "b"])).toBe("a && b");
    expect(commandText([])).toBeNull();
    expect(commandText(3)).toBeNull();
  });

  it("says where the values come from", () => {
    expect(standardCaption(ANSWER)).toBe(
      "From .groupon/desk.toml on staging; change it with a pull request.",
    );
    expect(standardCaption({ ...ANSWER, source: "checkout" })).toMatch(
      /in this checkout: it is not on staging yet/,
    );
  });
});
