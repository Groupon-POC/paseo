// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for taking an agent's comparison request once.

import { afterEach, describe, expect, it } from "vitest";
import {
  applyRequestedComparison,
  resetWorkingDiffComparisons,
  resolveWorkingDiffComparison,
  selectWorkingDiffComparison,
} from "./index";

const WORKSPACE = { serverId: "srv", workspaceId: "w1", cwd: "" };

describe("applyRequestedComparison", () => {
  afterEach(() => resetWorkingDiffComparisons());

  it("takes an agent's request once, so the person's pick afterwards stays", () => {
    applyRequestedComparison({
      ...WORKSPACE,
      comparison: "all",
      requestedAt: "2026-10-30T10:00:00Z",
    });
    expect(resolveWorkingDiffComparison(WORKSPACE)).toBe("all");

    selectWorkingDiffComparison({ ...WORKSPACE, comparison: "uncommitted" });
    applyRequestedComparison({
      ...WORKSPACE,
      comparison: "all",
      requestedAt: "2026-10-30T10:00:00Z",
    });
    expect(resolveWorkingDiffComparison(WORKSPACE)).toBe("uncommitted");

    applyRequestedComparison({
      ...WORKSPACE,
      comparison: "base",
      requestedAt: "2026-10-30T11:00:00Z",
    });
    expect(resolveWorkingDiffComparison(WORKSPACE)).toBe("base");
  });
});
