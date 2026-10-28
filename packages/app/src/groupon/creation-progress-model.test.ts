// Added for Groupon Desk (fork of Paseo, Apache-2.0): New workspace names the step it waits on and for how long.
import { describe, expect, it } from "vitest";
import {
  creationCaption,
  creationStatus,
  formatElapsed,
  progressWithStep,
  startedProgress,
} from "./creation-progress-model";

describe("creationCaption", () => {
  it("names no step before the daemon reports one, with the time since Enter", () => {
    expect(creationCaption(startedProgress(1_000), 3_400)).toBe("Starting the workspace, 2 s");
  });

  it("follows the daemon's steps, each with its own clock and the whole wait beside it", () => {
    let progress = startedProgress(0);
    progress = progressWithStep(progress, "naming_branch", 500);
    expect(creationCaption(progress, 900)).toBe("Naming the branch, 0 s");
    progress = progressWithStep(progress, "fetching_base", 1_200);
    progress = progressWithStep(progress, "creating_worktree", 2_700);
    expect(creationCaption(progress, 42_700)).toBe(
      "Creating the worktree (git worktree add), 40 s (42 s in all)",
    );
    progress = progressWithStep(progress, "registering_workspace", 43_000);
    expect(creationCaption(progress, 44_000)).toBe("Opening the workspace, 1 s (44 s in all)");
  });

  it("keeps the step's clock when the same step is reported again", () => {
    const first = progressWithStep(startedProgress(0), "creating_worktree", 1_000);
    expect(progressWithStep(first, "creating_worktree", 9_000)).toBe(first);
    expect(progressWithStep(first, undefined, 9_000)).toBe(first);
  });

  it("reads a step it does not know as a generic one", () => {
    const progress = progressWithStep(startedProgress(0), "warming_cache", 0);
    expect(creationCaption(progress, 3_000)).toBe("Preparing the workspace, 3 s");
  });
});

describe("creationStatus", () => {
  it("leads with the whole wait and adds the daemon's step once there is one", () => {
    expect(creationStatus(startedProgress(1_000), 3_400)).toEqual({ elapsed: "2 s", step: null });
    const progress = progressWithStep(startedProgress(0), "creating_worktree", 2_000);
    expect(creationStatus(progress, 42_000)).toEqual({
      elapsed: "42 s",
      step: "Creating the worktree (git worktree add), 40 s",
    });
  });
});

describe("formatElapsed", () => {
  it("counts whole seconds, then minutes", () => {
    expect(formatElapsed(-5)).toBe("0 s");
    expect(formatElapsed(59_999)).toBe("59 s");
    expect(formatElapsed(65_000)).toBe("1 min 05 s");
    expect(formatElapsed(171_000)).toBe("2 min 51 s");
  });
});
