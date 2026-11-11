// Added for Groupon Desk (fork of Paseo, Apache-2.0): the branch New workspace cuts a worktree from by default.
import { describe, expect, it } from "vitest";
import { bareBranchName, projectBasePickerItem } from "./default-base-branch";

describe("bareBranchName", () => {
  it("reads a remote or qualified name as the bare branch", () => {
    expect(bareBranchName("staging")).toBe("staging");
    expect(bareBranchName("origin/staging")).toBe("staging");
    expect(bareBranchName("refs/heads/main")).toBe("main");
    expect(bareBranchName("refs/remotes/origin/feature/x")).toBe("feature/x");
  });

  it("is nothing for an empty or missing value", () => {
    expect(bareBranchName("  ")).toBeNull();
    expect(bareBranchName(null)).toBeNull();
  });
});

describe("projectBasePickerItem", () => {
  it("is origin's ref of the branch, the row the branch list shows for it", () => {
    expect(projectBasePickerItem("staging")).toMatchObject({
      kind: "branch",
      name: "staging",
      refName: "refs/remotes/origin/staging",
    });
    expect(projectBasePickerItem(null)).toBeNull();
  });
});
