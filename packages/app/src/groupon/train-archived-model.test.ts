// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for reading the workspaces a release train archived.

import { describe, expect, it, vi } from "vitest";
import {
  GROUPON_DESK_RPC_PLUGIN_ID,
  parseTrainArchived,
  readTrainArchived,
  TRAIN_ARCHIVED_METHOD,
  trainArchivedHint,
} from "./train-archived-model";

const workspace = {
  workspaceId: "wks_1",
  projectId: "p1",
  name: "Fix the login",
  branch: "ctzaruba/fix-the-login",
  cwd: "/w/one",
  archivedAt: "not a date",
  pullRequestUrl: "https://github.com/groupon2/engineering-development/pull/371",
  pullRequestHead: "staging",
};

describe("the workspaces a release train archived", () => {
  it("asks the daemon itself, not a plugin", async () => {
    const invokePluginRpc = vi.fn(async () => ({ workspaces: [workspace] }));
    expect(await readTrainArchived({ invokePluginRpc })).toEqual([workspace]);
    expect(invokePluginRpc).toHaveBeenCalledWith(
      GROUPON_DESK_RPC_PLUGIN_ID,
      TRAIN_ARCHIVED_METHOD,
      {},
    );
  });

  it("drops a malformed row and refuses a malformed answer", () => {
    expect(parseTrainArchived({ workspaces: [workspace, { workspaceId: 1 }] })).toHaveLength(1);
    expect(() => parseTrainArchived({ nope: true })).toThrow(/shape/);
  });

  it("says which train archived it and the branch", () => {
    expect(trainArchivedHint(workspace)).toBe(
      "#371 (head staging), archived not a date · ctzaruba/fix-the-login",
    );
  });

  it("reads a trunk workspace archived without a pull request, and says the trunk and the date", () => {
    const trunk = {
      ...workspace,
      workspaceId: "wks_2",
      branch: "staging",
      cwd: "/Users/t/GitHub/engineering-development",
      pullRequestUrl: null,
      pullRequestHead: "staging",
    };
    expect(parseTrainArchived({ workspaces: [workspace, trunk] })).toEqual([workspace, trunk]);
    expect(trainArchivedHint(trunk)).toBe(
      "On staging, archived not a date · /Users/t/GitHub/engineering-development",
    );
    const dated = { ...trunk, archivedAt: "2026-10-20T11:35:28.584Z" };
    expect(trainArchivedHint(dated)).toContain(new Date(dated.archivedAt).toLocaleString());
  });
});
