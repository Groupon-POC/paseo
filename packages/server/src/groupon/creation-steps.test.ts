// Added for Groupon Desk (fork of Paseo, Apache-2.0): a workspace being created tells its observers each step, in order, before it is ready.

import pino from "pino";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { CreationSnapshot, WorkspaceDescriptorPayload } from "@getpaseo/protocol/messages";
import { CreationService } from "../server/creation/index.js";
import { reportCreationStep, runWithCreationSteps } from "./creation-steps.js";

const silentLogger = pino({ level: "silent" });
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

const workspace: WorkspaceDescriptorPayload = {
  id: "wks_0123456789abcdef",
  projectId: "project",
  projectDisplayName: "Project",
  projectRootPath: "/project",
  workspaceDirectory: "/project/worktree",
  projectKind: "git",
  workspaceKind: "worktree",
  name: "Worktree",
  status: "running",
  statusEnteredAt: null,
  activityAt: null,
  archivingAt: null,
  scripts: [],
};

async function createWorkspaceReporting(steps: () => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "creation-steps-"));
  directories.push(directory);
  const service = new CreationService(directory, silentLogger);
  const updates: CreationSnapshot[] = [];
  const result = await service.create(
    {
      kind: "workspace",
      key: "steps",
      request: { source: "/project" },
      workspaceId: workspace.id,
      hasAgent: false,
      hasPrompt: false,
      exists: async () => false,
      provision: async () => {
        await steps();
        return { workspace };
      },
    },
    (snapshot) => updates.push(snapshot),
  );
  return { directory, result, updates };
}

describe("creation steps", () => {
  test("each step reaches the observer in order, between accepted and workspace_ready", async () => {
    const { updates } = await createWorkspaceReporting(async () => {
      reportCreationStep("naming_branch");
      await Promise.resolve();
      reportCreationStep("fetching_base");
      await new Promise((resolve) => setTimeout(resolve, 1));
      reportCreationStep("creating_worktree");
      reportCreationStep("registering_workspace");
    });

    expect(updates.map((u) => [u.phase, u.step?.id ?? null])).toEqual([
      ["accepted", null],
      ["accepted", "naming_branch"],
      ["accepted", "fetching_base"],
      ["accepted", "creating_worktree"],
      ["accepted", "registering_workspace"],
      ["workspace_ready", "registering_workspace"],
      ["completed", "registering_workspace"],
    ]);
    const revisions = updates.map((u) => u.revision);
    expect(revisions).toEqual([...revisions].sort((a, b) => a - b));
    expect(new Set(revisions).size).toBe(revisions.length);
    for (const update of updates.filter((u) => u.step)) {
      expect(Number.isNaN(Date.parse(update.step!.startedAt))).toBe(false);
    }
  });

  test("a finished creation reads back the same from its receipt", async () => {
    const { directory, result } = await createWorkspaceReporting(async () => {
      reportCreationStep("creating_worktree");
    });
    const again = await new CreationService(directory, silentLogger).subscribe(
      "workspace",
      "steps",
      () => {},
    );
    again.unsubscribe();
    expect(again.snapshot).toEqual(result);
    expect(result.phase).toBe("completed");
  });

  test("a step reported outside a creation goes nowhere, and a failing reporter fails nothing", () => {
    expect(() => reportCreationStep("creating_worktree")).not.toThrow();
    const value = runWithCreationSteps(
      () => {
        throw new Error("screen gone");
      },
      () => {
        reportCreationStep("fetching_base");
        return 42;
      },
    );
    expect(value).toBe(42);
  });
});
