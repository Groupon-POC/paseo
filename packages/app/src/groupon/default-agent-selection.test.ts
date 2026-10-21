// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for the agent New workspace preselects.

/**
 * Tests for the agent a composer preselects.
 *
 * Covers: groupon/default-agent-selection.ts
 */

import { describe, expect, it } from "vitest";
import { pickProvider } from "./default-agent-selection";

describe("pickProvider", () => {
  it("takes the agent used last on this device when this Mac can start it", () => {
    expect(pickProvider(["claude", "codex"], "codex")).toBe("codex");
  });

  it("takes Claude when nothing was used last or the last agent cannot start here", () => {
    expect(pickProvider(["codex", "claude"], null)).toBe("claude");
    expect(pickProvider(["codex", "claude"], undefined)).toBe("claude");
    expect(pickProvider(["codex", "claude"], "gone")).toBe("claude");
  });

  it("takes the first agent when there is no Claude", () => {
    expect(pickProvider(["pi", "codex"], null)).toBe("pi");
  });

  it("is null when no agent can start", () => {
    expect(pickProvider([], "codex")).toBeNull();
  });
});
