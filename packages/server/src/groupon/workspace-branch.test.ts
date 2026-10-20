// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for a ticketless workspace's branch name.

import { describe, expect, test, vi } from "vitest";
import {
  nameWorkspaceBranch,
  promptSlug,
  renameTargetForPlaceholder,
  resolveBranchOwner,
  workspaceBranchName,
  type WorkspaceBranchDeps,
} from "./workspace-branch.js";

function deps(overrides: Partial<WorkspaceBranchDeps> = {}): WorkspaceBranchDeps {
  return {
    readGithubLogin: vi.fn(async () => "CTZaruba"),
    unixUser: () => "c_tzaruba",
    branchTaken: vi.fn(async () => false),
    ...overrides,
  };
}

describe("promptSlug", () => {
  test("a short question", () => {
    expect(promptSlug("hi")).toBe("hi");
  });

  test("diacritics dropped, at most 40 characters, cut at a word", () => {
    const slug = promptSlug("Oprav přihlášení do administrace, když uživatel zapomene heslo");
    expect(slug).toBe("oprav-prihlaseni-do-administrace-kdyz");
    expect(slug.length).toBeLessThanOrEqual(40);
  });

  test("nothing to slug gives an empty slug", () => {
    expect(promptSlug("???")).toBe("");
  });
});

describe("the branch name", () => {
  test("`<login>/<slug>`, both git-safe", () => {
    expect(workspaceBranchName("CTZaruba", "hi")).toBe("ctzaruba/hi");
    expect(workspaceBranchName("c_tzaruba", "fix-it")).toBe("c-tzaruba/fix-it");
  });

  test("the GitHub login on the repository's host, else the unix user", async () => {
    const readGithubLogin = vi.fn(async () => null);
    expect(
      await resolveBranchOwner("git@github.groupondev.com:groupon/repo.git", {
        readGithubLogin,
        unixUser: () => "c_tzaruba",
      }),
    ).toBe("c_tzaruba");
    expect(readGithubLogin).toHaveBeenCalledWith("github.groupondev.com");
  });

  test("a ticketless workspace's branch comes from its first prompt, never the trunk", async () => {
    const named = await nameWorkspaceBranch(
      {
        repoRoot: "/repo",
        remoteUrl: "https://github.com/groupon2/engineering-development.git",
        prompt: "hi",
        fallbackSlug: "brave-otter",
      },
      deps(),
    );
    expect(named).toEqual({ branchName: "ctzaruba/hi", fromPrompt: true });
  });

  test("a taken name gets the next free suffix", async () => {
    const branchTaken = vi.fn(async (_cwd: string, branch: string) => branch === "ctzaruba/hi");
    const named = await nameWorkspaceBranch(
      { repoRoot: "/repo", remoteUrl: null, prompt: "hi", fallbackSlug: "brave-otter" },
      deps({ branchTaken }),
    );
    expect(named?.branchName).toBe("ctzaruba/hi-2");
  });

  test("a workspace started empty takes the worktree's name until its first message", async () => {
    const named = await nameWorkspaceBranch(
      { repoRoot: "/repo", remoteUrl: null, prompt: null, fallbackSlug: "brave-otter" },
      deps(),
    );
    expect(named).toEqual({ branchName: "ctzaruba/brave-otter", fromPrompt: false });
    expect(renameTargetForPlaceholder(named?.branchName, "Fix the watch")).toBe(
      "ctzaruba/fix-the-watch",
    );
  });

  test("Paseo's own placeholder (no owner) keeps Paseo's generated name", () => {
    expect(renameTargetForPlaceholder("brave-otter", "Fix the watch")).toBeUndefined();
    expect(renameTargetForPlaceholder("ctzaruba/brave-otter", "???")).toBeNull();
  });
});
