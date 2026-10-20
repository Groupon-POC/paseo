// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for the shared-trunk rule.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  branchNameOf,
  isCheckoutOnSharedTrunk,
  isSharedTrunkBranch,
  isWorkspaceOnSharedTrunk,
  readDeskTargetBranch,
  readOriginHeadBranch,
  type SharedTrunkCheckoutFacts,
} from "./shared-trunk.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "groupon-trunk-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function facts(overrides: Partial<SharedTrunkCheckoutFacts> = {}): SharedTrunkCheckoutFacts {
  return {
    worktreeRoot: root,
    currentBranch: "ctzaruba/fix-the-login",
    gitCommonDir: join(root, ".git"),
    mainRepoRoot: root,
    storedBaseRef: null,
    resolvedBaseRef: "staging",
    pullRequestLookupTarget: { headRef: "ctzaruba/fix-the-login" },
    ...overrides,
  };
}

function writeDeskToml(text: string): void {
  mkdirSync(join(root, ".groupon"), { recursive: true });
  writeFileSync(join(root, ".groupon", "desk.toml"), text);
}

describe("isSharedTrunkBranch", () => {
  test.each([
    "staging",
    "production",
    "main",
    "master",
    "develop",
    "origin/staging",
    "refs/heads/main",
  ])("%s is a shared trunk everywhere", (branch) => {
    expect(isSharedTrunkBranch(branch)).toBe(true);
  });

  test("a person's branch is not a trunk", () => {
    expect(isSharedTrunkBranch("ctzaruba/hi")).toBe(false);
    expect(isSharedTrunkBranch("staging-fix")).toBe(false);
    expect(isSharedTrunkBranch(null)).toBe(false);
  });

  test("the repository's own trunks count too", () => {
    expect(isSharedTrunkBranch("groupon", ["refs/remotes/origin/groupon"])).toBe(true);
  });

  test("branchNameOf strips the ref prefixes", () => {
    expect(branchNameOf("refs/remotes/upstream/main")).toBe("main");
    expect(branchNameOf("origin/ctzaruba/x")).toBe("ctzaruba/x");
    expect(branchNameOf("  ")).toBeNull();
  });
});

describe("the repository's own trunks", () => {
  test("desk.toml's [git] target_branch", () => {
    writeDeskToml('[prompts]\ncreate_pr = "x"\n\n[git]\ntarget_branch = "groupon"\n');
    expect(readDeskTargetBranch(root)).toBe("groupon");
  });

  test("no file, no key, or not TOML reads as none", () => {
    expect(readDeskTargetBranch(root)).toBeNull();
    writeDeskToml("[git]\ndelete_branch_on_archive = false\n");
    expect(readDeskTargetBranch(root)).toBeNull();
  });

  test("origin/HEAD names the default branch", () => {
    mkdirSync(join(root, ".git", "refs", "remotes", "origin"), { recursive: true });
    writeFileSync(
      join(root, ".git", "refs", "remotes", "origin", "HEAD"),
      "ref: refs/remotes/origin/trunk\n",
    );
    expect(readOriginHeadBranch(join(root, ".git"))).toBe("trunk");
    expect(
      isCheckoutOnSharedTrunk(
        facts({ currentBranch: "trunk", resolvedBaseRef: null, pullRequestLookupTarget: null }),
      ),
    ).toBe(true);
  });
});

describe("isCheckoutOnSharedTrunk", () => {
  test("a workspace on staging is matched to no pull request", () => {
    expect(
      isCheckoutOnSharedTrunk(
        facts({ currentBranch: "staging", pullRequestLookupTarget: { headRef: "staging" } }),
      ),
    ).toBe(true);
  });

  test("a feature branch whose pull request lookup lands on staging is matched to none", () => {
    expect(
      isCheckoutOnSharedTrunk(facts({ pullRequestLookupTarget: { headRef: "staging" } })),
    ).toBe(true);
  });

  test("a feature branch's own pull request is still matched", () => {
    expect(isCheckoutOnSharedTrunk(facts())).toBe(false);
  });

  test("a fork's main is that fork's own branch, not our trunk", () => {
    expect(
      isCheckoutOnSharedTrunk(
        facts({
          currentBranch: "someone/main",
          pullRequestLookupTarget: { headRef: "main", headRepositoryOwner: "someone" },
        }),
      ),
    ).toBe(false);
  });

  test("desk.toml's target_branch is a trunk of its repository", () => {
    writeDeskToml('[git]\ntarget_branch = "groupon"\n');
    expect(
      isCheckoutOnSharedTrunk(
        facts({
          currentBranch: "groupon",
          resolvedBaseRef: null,
          pullRequestLookupTarget: { headRef: "groupon" },
        }),
      ),
    ).toBe(true);
  });

  test("without facts, the branch and the base decide", () => {
    expect(
      isWorkspaceOnSharedTrunk({
        facts: null,
        currentBranch: "release",
        baseRef: "release",
        repoRoot: root,
      }),
    ).toBe(true);
    expect(
      isWorkspaceOnSharedTrunk({
        facts: null,
        currentBranch: "ctzaruba/x",
        baseRef: "staging",
        repoRoot: root,
      }),
    ).toBe(false);
  });
});
