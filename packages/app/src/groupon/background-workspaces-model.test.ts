// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for reading the workspaces with a background task.

import { describe, expect, it } from "vitest";
import { readBackgroundWorkspaceIds } from "./background-workspaces-model";

const clientAnswering = (answer: unknown) => ({
  invokePluginRpc: async (pluginId: string, method: string) => {
    expect([pluginId, method]).toEqual(["groupon-desk", "groupon-desk.workspaces.background"]);
    return answer;
  },
});

describe("the workspaces with a background task", () => {
  it("are the daemon's workspace ids, anything else dropped", async () => {
    expect(
      await readBackgroundWorkspaceIds(clientAnswering({ workspaceIds: ["ws-a", 7, "ws-b"] })),
    ).toEqual(["ws-a", "ws-b"]);
  });

  it("are none for an answer of another shape (an older daemon)", async () => {
    expect(await readBackgroundWorkspaceIds(clientAnswering(null))).toEqual([]);
    expect(await readBackgroundWorkspaceIds(clientAnswering({ workspaceIds: "ws-a" }))).toEqual([]);
  });
});
