// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for the list of workspaces a release train archived.

import { describe, expect, test, vi } from "vitest";
import type { PersistedWorkspaceRecord } from "../server/workspace-registry.js";
import { listTrainArchivedWorkspaces, pullRequestNumberOf } from "./train-archived.js";

function record(overrides: Partial<PersistedWorkspaceRecord>): PersistedWorkspaceRecord {
  return {
    workspaceId: "wks_1",
    projectId: "p1",
    cwd: "/w/one",
    kind: "worktree",
    displayName: "one",
    title: null,
    branch: "ctzaruba/one",
    worktreeRoot: "/w/one",
    baseBranch: "refs/remotes/origin/staging",
    isPaseoOwnedWorktree: true,
    mainRepoRoot: "/repo",
    createdAt: "2026-10-19T08:00:00.000Z",
    updatedAt: "2026-10-19T08:00:00.000Z",
    archivedAt: "2026-10-19T09:00:00.000Z",
    autoArchivedChangeRequestUrl: "https://github.com/groupon2/engineering-development/pull/371",
    pinnedAt: null,
    background: false,
    ...overrides,
  } as PersistedWorkspaceRecord;
}

describe("workspaces archived by a release train", () => {
  test("pull request numbers out of their addresses", () => {
    expect(pullRequestNumberOf("https://github.com/o/r/pull/375")).toBe(375);
    expect(pullRequestNumberOf("https://gitlab.com/o/r/-/merge_requests/12")).toBe(12);
    expect(pullRequestNumberOf("https://github.com/o/r")).toBeNull();
  });

  test("lists the archives whose pull request's head was a trunk, asking each pull request once", async () => {
    const readPullRequestHead = vi.fn(async (_cwd: string, number: number) =>
      number === 371 ? "staging" : "ctzaruba/two",
    );
    const listed = await listTrainArchivedWorkspaces({
      listWorkspaces: async () => [
        record({ workspaceId: "wks_1" }),
        record({ workspaceId: "wks_2", archivedAt: "2026-10-19T10:00:00.000Z" }),
        record({
          workspaceId: "wks_3",
          autoArchivedChangeRequestUrl:
            "https://github.com/groupon2/engineering-development/pull/380",
        }),
        record({ workspaceId: "wks_4", autoArchivedChangeRequestUrl: null }),
        record({ workspaceId: "wks_5", archivedAt: null }),
      ],
      readPullRequestHead,
      directoryExists: () => true,
    });
    expect(listed.map((workspace) => workspace.workspaceId)).toEqual(["wks_2", "wks_1"]);
    expect(listed[0]?.pullRequestHead).toBe("staging");
    expect(readPullRequestHead).toHaveBeenCalledTimes(2);
  });

  test("a workspace on the trunk itself is listed without asking the forge", async () => {
    const readPullRequestHead = vi.fn(async () => "staging");
    const listed = await listTrainArchivedWorkspaces({
      listWorkspaces: async () => [record({ branch: "staging" })],
      readPullRequestHead,
      directoryExists: () => true,
    });
    expect(listed).toHaveLength(1);
    expect(readPullRequestHead).not.toHaveBeenCalled();
  });

  test("a pull request the forge cannot answer for is left out", async () => {
    const listed = await listTrainArchivedWorkspaces({
      listWorkspaces: async () => [record({})],
      readPullRequestHead: async () => {
        throw new Error("gh: not signed in");
      },
      directoryExists: () => true,
    });
    expect(listed).toEqual([]);
  });
});
