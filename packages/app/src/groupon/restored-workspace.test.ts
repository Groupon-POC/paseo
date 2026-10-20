// Added for Groupon Desk (fork of Paseo, Apache-2.0): a relaunch onto a gone workspace goes home.
import { describe, expect, it } from "vitest";
import { noteRestoredWorkspace, restoredWorkspaceVerdict } from "./restored-workspace";

const AT = { serverId: "srv_mini", workspaceId: "wks_archived" };

describe("restoredWorkspaceVerdict", () => {
  it("leaves for home when the workspace a relaunch reopened turns out gone", () => {
    noteRestoredWorkspace(AT);
    expect(restoredWorkspaceVerdict({ ...AT, stateKind: "loading" })).toBe("wait");
    expect(restoredWorkspaceVerdict({ ...AT, stateKind: "unreachable" })).toBe("wait");
    expect(restoredWorkspaceVerdict({ ...AT, stateKind: "missing" })).toBe("leave");
    // Spent: the same workspace opened again by the person says what it is.
    expect(restoredWorkspaceVerdict({ ...AT, stateKind: "missing" })).toBe("stay");
  });

  it("leaves for an archived one too", () => {
    noteRestoredWorkspace(AT);
    expect(restoredWorkspaceVerdict({ ...AT, stateKind: "archived" })).toBe("leave");
  });

  it("stays on a workspace that is there, and spends the note", () => {
    noteRestoredWorkspace(AT);
    expect(restoredWorkspaceVerdict({ ...AT, stateKind: "ready" })).toBe("stay");
    expect(restoredWorkspaceVerdict({ ...AT, stateKind: "missing" })).toBe("stay");
  });

  it("never moves a workspace the person opened themselves", () => {
    noteRestoredWorkspace(AT);
    expect(
      restoredWorkspaceVerdict({
        serverId: "srv_mini",
        workspaceId: "wks_other",
        stateKind: "missing",
      }),
    ).toBe("stay");
  });
});
