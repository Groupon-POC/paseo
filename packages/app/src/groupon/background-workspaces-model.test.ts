// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for reading the workspaces with a background task; which rows the status groups file under Waiting.

import { describe, expect, it } from "vitest";
import { markWaitingInBackground, readBackgroundWorkspaceIds } from "./background-workspaces-model";

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

describe("the rows the status groups file under Waiting", () => {
  const row = (
    workspaceId: string,
    statusBucket: string,
  ): {
    serverId: string;
    workspaceId: string;
    statusBucket: string;
    waitingInBackground?: boolean;
  } => ({
    serverId: "mac-a",
    workspaceId,
    statusBucket,
  });

  it("are the finished rows whose workspace runs a background task on that host", () => {
    const rows = [row("ws-done", "done"), row("ws-att", "attention"), row("ws-run", "running")];
    const background = new Map([["mac-a", ["ws-done", "ws-att", "ws-run"]]]);

    const marked = markWaitingInBackground(rows, background);

    expect(marked.map((r) => r.waitingInBackground)).toEqual([true, true, undefined]);
    expect(marked[2]).toBe(rows[2]);
  });

  it("are none when the task runs on another host or has ended", () => {
    const waiting = { ...row("ws-done", "done"), waitingInBackground: true };
    const marked = markWaitingInBackground([waiting], new Map([["mac-b", ["ws-done"]]]));

    expect(marked[0]?.waitingInBackground).toBe(false);
  });
});
