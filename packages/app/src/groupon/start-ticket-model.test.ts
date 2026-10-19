// Added for Groupon Desk (fork of Paseo, Apache-2.0): Start a ticket's choices.
import { describe, expect, it } from "vitest";
import type { ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";
import {
  agentChoices,
  defaultEffortId,
  defaultModelId,
  normalizeTicketKey,
  repositoryChoices,
  startProblem,
} from "./start-ticket-model";

const CLAUDE: ProviderSnapshotEntry = {
  provider: "claude-a833dd2d",
  status: "ready",
  enabled: true,
  label: "Claude · c_tzaruba@groupon.com (Max)",
  models: [
    {
      provider: "claude-a833dd2d",
      id: "opus",
      label: "Opus",
      thinkingOptions: [
        { id: "medium", label: "Medium" },
        { id: "high", label: "High", isDefault: true },
      ],
    },
    { provider: "claude-a833dd2d", id: "haiku", label: "Haiku", isDefault: true },
    { provider: "claude-a833dd2d", id: "old", label: "Old", isSelectable: false },
  ],
};

describe("Start a ticket's choices", () => {
  // The CLI's own cases (packages/groupon-cli tests for normalizeTicketKey); the plugin's test
  // holds its copy equal to the CLI's function.
  it.each([
    ["ENC-1234", "ENC-1234"],
    ["enc-1234", "ENC-1234"],
    [" https://groupondev.atlassian.net/browse/ENC-1234 ", "ENC-1234"],
    ["https://groupondev.atlassian.net/browse/ENC-1234?focusedCommentId=1", "ENC-1234"],
    ["https://groupondev.atlassian.net/browse/ENC-1234/", "ENC-1234"],
    ["ENC-", null],
    ["fix the watch", null],
    ["", null],
  ])("reads %j as %s", (input, key) => {
    expect(normalizeTicketKey(input)).toBe(key);
  });

  it("offers the agents ready on this Mac, by their own label", () => {
    const entries: ProviderSnapshotEntry[] = [
      CLAUDE,
      { provider: "codex", status: "loading", enabled: true },
      { provider: "opencode", status: "ready", enabled: false },
    ];
    expect(agentChoices(entries)).toEqual([
      { id: "claude-a833dd2d", label: "Claude · c_tzaruba@groupon.com (Max)" },
    ]);
    expect(agentChoices(undefined)).toEqual([]);
  });

  it("starts from the page's model and effort when the agent has them, else the defaults", () => {
    expect(defaultModelId(CLAUDE, "opus")).toBe("opus");
    expect(defaultModelId(CLAUDE, "old")).toBe("haiku");
    expect(defaultModelId(CLAUDE, null)).toBe("haiku");
    const opus = CLAUDE.models?.[0];
    expect(defaultEffortId(opus, "medium")).toBe("medium");
    expect(defaultEffortId(opus, "max")).toBe("high");
    expect(defaultEffortId(CLAUDE.models?.[1], "high")).toBeNull();
  });

  it("offers the git projects with a checkout on this Mac", () => {
    const projects = [
      {
        viewKey: "a",
        projectName: "engineering-development",
        projectKind: "git",
        hosts: [{ serverId: "mac-1", iconWorkingDir: "/src/ed", projectId: "prj_1" }],
      },
      {
        viewKey: "b",
        projectName: "notes",
        projectKind: "directory",
        hosts: [{ serverId: "mac-1", iconWorkingDir: "/src/notes", projectId: "prj_2" }],
      },
      {
        viewKey: "c",
        projectName: "infra-development",
        projectKind: "git",
        hosts: [{ serverId: "mac-2", iconWorkingDir: "/src/infra", projectId: "prj_3" }],
      },
    ];
    expect(repositoryChoices(projects, "mac-1")).toEqual([
      { key: "a", label: "engineering-development", projectRoot: "/src/ed", projectId: "prj_1" },
    ]);
  });

  it("says what is missing before Start", () => {
    const repository = { key: "a", label: "ed", projectRoot: "/src/ed", projectId: null };
    expect(startProblem({ ticket: "", repository, provider: "claude", model: "opus" })).toMatch(
      /Type the ticket/,
    );
    expect(
      startProblem({ ticket: "fix it", repository, provider: "claude", model: "opus" }),
    ).toMatch(/not a ticket key/);
    expect(
      startProblem({ ticket: "ENC-1", repository: null, provider: "claude", model: "opus" }),
    ).toMatch(/repository/);
    expect(startProblem({ ticket: "ENC-1", repository, provider: null, model: null })).toMatch(
      /agent/,
    );
    expect(
      startProblem({ ticket: "ENC-1", repository, provider: "claude", model: "opus" }),
    ).toBeNull();
  });
});
