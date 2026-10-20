// Added for Groupon Desk (fork of Paseo, Apache-2.0): Improve this repository's choices.
/**
 * Tests for Improve this repository: which prompt is sent, which Mac it starts on, and why it
 * cannot start.
 *
 * Covers: packages/app/src/groupon/improve-repository-model.ts
 */
import { describe, expect, it } from "vitest";
import type { ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";
import type { HostProjectListItem } from "@/projects/host-project-model";
import {
  IMPROVE_PROMPT_KEY,
  IMPROVE_WORKTREE_SLUG,
  improveAgent,
  improveMacProblem,
  improveMacServerId,
  improveMacs,
  improvePrompt,
  improveStartProblem,
  improveWorkspaceRequest,
  requestedRepositoryId,
} from "./improve-repository-model";
import type { MacPickerOption } from "./mac-picker-model";
import type { RepositoryEntry } from "./repository-picker-model";
import { GROUPON_IMPROVE } from "./strings";

function mac(id: string, label: string, extra: Partial<MacPickerOption> = {}): MacPickerOption {
  return {
    id,
    label,
    serverId: `srv_${id}`,
    hostServerId: `srv_${id}`,
    machineIds: [id],
    isThisMac: false,
    selectable: true,
    note: null,
    ...extra,
  };
}

/** This Mac (the Air, serving), the Mini in the office (serving), the Studio (no hand). */
const AIR = mac("air", "MacBook Air", { isThisMac: true, note: "This Mac" });
const MINI = mac("mini", "Mac Mini");
const STUDIO = mac("studio", "Mac Studio", {
  serverId: null,
  selectable: false,
  note: "hand not running",
});
const MACS = [AIR, MINI, STUDIO];

function entry(
  id: string,
  label: string,
  checkouts: { macId: string; path: string; projectId?: string | null }[],
): RepositoryEntry {
  return {
    id,
    label,
    remote: `github.com/${label}`,
    project: null,
    checkouts: checkouts.map((checkout) => ({
      macId: checkout.macId,
      serverId: `srv_${checkout.macId}`,
      macLabel: checkout.macId,
      path: checkout.path,
      projectId: checkout.projectId ?? null,
    })),
  };
}

const MONOREPO = entry(
  "repo:github.com/groupon2/engineering-development",
  "groupon2/engineering-development",
  [
    { macId: "mini", path: "/Users/t/GitHub/engineering-development", projectId: "p_mono_mini" },
    { macId: "air", path: "/Users/t/GitHub/engineering-development" },
  ],
);
const INFRA = entry("repo:github.com/groupon2/infra-development", "groupon2/infra-development", [
  { macId: "mini", path: "/Users/t/GitHub/infra-development" },
]);
const ON_STUDIO = entry(
  "repo:github.com/groupon2/finance-development",
  "groupon2/finance-development",
  [{ macId: "studio", path: "/Users/t/GitHub/finance-development" }],
);
const NOWHERE = entry("repo:github.com/groupon2/old-thing", "groupon2/old-thing", []);
const ENTRIES = [MONOREPO, INFRA, ON_STUDIO, NOWHERE];

const PROJECT_ON_MINI = {
  viewKey: "remote:github.com/groupon2/infra-development",
  projectKey: "remote:github.com/groupon2/infra-development",
  projectName: "infra-development",
  projectKind: "git",
  iconWorkingDir: "/Users/t/GitHub/infra-development",
  hosts: [
    {
      serverId: "srv_mini",
      projectId: "p_infra",
      iconWorkingDir: "/Users/t/GitHub/infra-development",
      worktreeSupport: "supported",
    },
  ],
  workspaceKeys: [],
} as unknown as HostProjectListItem;

describe("Improve this repository: the prompt", () => {
  it("sends the repository's own [prompts] improve_repository when it says something", () => {
    const answer = {
      settings: {
        prompts: { [IMPROVE_PROMPT_KEY]: "  Follow docs/onboarding.md, then open a PR.  " },
      },
    } as never;
    expect(improvePrompt(answer)).toEqual({
      text: "Follow docs/onboarding.md, then open a PR.",
      source: "repository",
    });
  });

  it("sends the window's default with no file, no key, or an empty one", () => {
    const fallback = { text: GROUPON_IMPROVE.defaultPrompt, source: "default" };
    expect(improvePrompt(undefined)).toEqual(fallback);
    expect(improvePrompt({ settings: null })).toEqual(fallback);
    expect(improvePrompt({ settings: { prompts: { create_pr: "x" } } } as never)).toEqual(fallback);
    expect(
      improvePrompt({ settings: { prompts: { [IMPROVE_PROMPT_KEY]: "   " } } } as never),
    ).toEqual(fallback);
  });

  it("has a default that adopts the standards, fixes desk.toml, eases the first minutes and never merges", () => {
    const text = GROUPON_IMPROVE.defaultPrompt;
    expect(text).toContain("groupon standards adopt");
    expect(text).toContain("groupon standards pull");
    expect(text).toContain(".groupon/desk.toml");
    expect(text).toContain("README");
    expect(text).toContain("AGENTS.md");
    expect(text).toContain("header");
    expect(text).toContain("one pull request");
    expect(text).toMatch(/never merge/i);
    expect(IMPROVE_WORKTREE_SLUG).toBe("improve-repository");
  });
});

describe("Improve this repository: the Mac", () => {
  it("lists only the Macs that hold the repository, this Mac first", () => {
    expect(improveMacs(MONOREPO, MACS).map((row) => row.mac.id)).toEqual(["air", "mini"]);
    expect(improveMacs(INFRA, MACS).map((row) => row.checkout.path)).toEqual([
      "/Users/t/GitHub/infra-development",
    ]);
    expect(improveMacs(null, MACS)).toEqual([]);
  });

  it("starts on this Mac when it holds the repository and serves, else the first that does", () => {
    expect(improveMacServerId(improveMacs(MONOREPO, MACS), null)).toBe("srv_air");
    expect(improveMacServerId(improveMacs(INFRA, MACS), null)).toBe("srv_mini");
  });

  it("starts on the Mac asked for (the row's or the person's) when it holds the repository and serves", () => {
    expect(improveMacServerId(improveMacs(MONOREPO, MACS), "srv_mini")).toBe("srv_mini");
    // A Mac that lacks the repository is not taken, even when asked for.
    expect(improveMacServerId(improveMacs(INFRA, MACS), "srv_air")).toBe("srv_mini");
  });

  it("never starts on a Mac whose hand is not running", () => {
    const holding = improveMacs(ON_STUDIO, MACS);
    expect(holding.map((row) => row.mac.id)).toEqual(["studio"]);
    expect(improveMacServerId(holding, "srv_studio")).toBeNull();
    const airWithoutHand = { ...AIR, selectable: false, serverId: null, note: "hand not running" };
    expect(improveMacServerId(improveMacs(MONOREPO, [airWithoutHand, MINI]), null)).toBe(
      "srv_mini",
    );
  });

  it("says why no Mac can take it: none holds it, or none holding it is serving", () => {
    expect(improveMacProblem(null, [])).toBe(GROUPON_IMPROVE.chooseRepository);
    expect(improveMacProblem(NOWHERE, improveMacs(NOWHERE, MACS))).toBe(
      GROUPON_IMPROVE.notOnAnyMac("groupon2/old-thing"),
    );
    expect(improveMacProblem(ON_STUDIO, improveMacs(ON_STUDIO, MACS))).toBe(
      GROUPON_IMPROVE.noMacServing("groupon2/finance-development", "Mac Studio"),
    );
    expect(improveMacProblem(MONOREPO, improveMacs(MONOREPO, MACS))).toBeNull();
  });
});

describe("Improve this repository: the repository it opens on", () => {
  const base = { entries: ENTRIES, projects: [PROJECT_ON_MINI], lastActiveProject: null };

  it("opens on the sidebar row's repository, by the project's view key", () => {
    expect(
      requestedRepositoryId({
        ...base,
        context: { projectViewKey: PROJECT_ON_MINI.viewKey },
        lastRepositoryId: MONOREPO.id,
      }),
    ).toBe(INFRA.id);
  });

  it("opens on the Projects page's checkout, by its Mac and path", () => {
    expect(
      requestedRepositoryId({
        ...base,
        context: { serverId: "srv_air", path: "/Users/t/GitHub/engineering-development" },
        lastRepositoryId: INFRA.id,
      }),
    ).toBe(MONOREPO.id);
  });

  it("opens from the home tile on where the person is, else the repository chosen last", () => {
    expect(
      requestedRepositoryId({
        ...base,
        context: {},
        lastActiveProject: PROJECT_ON_MINI,
        lastRepositoryId: MONOREPO.id,
      }),
    ).toBe(INFRA.id);
    expect(requestedRepositoryId({ ...base, context: {}, lastRepositoryId: MONOREPO.id })).toBe(
      MONOREPO.id,
    );
    expect(requestedRepositoryId({ ...base, context: {}, lastRepositoryId: null })).toBeNull();
  });
});

describe("Improve this repository: the agent and Start", () => {
  const CLAUDE: ProviderSnapshotEntry = {
    provider: "claude-a833dd2d",
    status: "ready",
    enabled: true,
    label: "Claude",
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
      { provider: "claude-a833dd2d", id: "sonnet", label: "Sonnet", isDefault: true },
    ],
  };
  const CODEX: ProviderSnapshotEntry = {
    provider: "codex",
    status: "ready",
    enabled: true,
    label: "Codex",
    models: [{ provider: "codex", id: "gpt", label: "GPT", isDefault: true }],
  };

  it("takes the agent and model New workspace used last when this Mac has them", () => {
    const agent = improveAgent([CODEX, CLAUDE], {
      provider: "claude-a833dd2d",
      providerPreferences: {
        "claude-a833dd2d": { model: "opus", mode: "default", thinkingByModel: { opus: "medium" } },
      },
    });
    expect(agent).toEqual({
      provider: "claude-a833dd2d",
      label: "Claude",
      model: "opus",
      modelLabel: "Opus",
      thinkingOptionId: "medium",
      modeId: "default",
    });
  });

  it("falls back to a Claude agent and its default model, else the first ready agent", () => {
    expect(improveAgent([CODEX, CLAUDE], null)?.model).toBe("sonnet");
    expect(improveAgent([CODEX], { provider: "gone" })?.provider).toBe("codex");
    expect(improveAgent([], null)).toBeNull();
  });

  it("starts only with a repository, a serving Mac, the prompt read and an agent", () => {
    const agent = improveAgent([CLAUDE], null);
    const ready = {
      entry: MONOREPO,
      macProblem: null,
      serverId: "srv_air",
      agent,
      promptReady: true,
    };
    expect(improveStartProblem(ready)).toBeNull();
    expect(improveStartProblem({ ...ready, entry: null })).toBe(GROUPON_IMPROVE.chooseRepository);
    expect(improveStartProblem({ ...ready, macProblem: "none serving", serverId: null })).toBe(
      "none serving",
    );
    expect(improveStartProblem({ ...ready, promptReady: false })).toBe(
      GROUPON_IMPROVE.readingPrompt,
    );
    expect(improveStartProblem({ ...ready, agent: null })).toBe(GROUPON_IMPROVE.noAgent);
  });

  it("creates the workspace in a fresh worktree improve-repository and sends the previewed prompt", () => {
    const agent = improveAgent([CLAUDE], null)!;
    const prompt = improvePrompt(undefined).text;
    expect(
      improveWorkspaceRequest({
        checkout: { path: "/Users/t/GitHub/engineering-development", projectId: "p_mono_mini" },
        agent,
        prompt,
      }),
    ).toEqual({
      title: GROUPON_IMPROVE.workspaceTitle,
      source: {
        kind: "worktree",
        cwd: "/Users/t/GitHub/engineering-development",
        projectId: "p_mono_mini",
        worktreeSlug: "improve-repository",
      },
      agent: {
        config: {
          provider: "claude-a833dd2d",
          cwd: "/Users/t/GitHub/engineering-development",
          model: "sonnet",
        },
        initialPrompt: prompt,
      },
    });
    // A checkout only the hub knows yet: the daemon finds the project from the folder.
    const hubOnly = improveWorkspaceRequest({
      checkout: { path: "/Users/t/GitHub/infra-development", projectId: null },
      agent,
      prompt,
    });
    expect(hubOnly.source).toEqual({
      kind: "worktree",
      cwd: "/Users/t/GitHub/infra-development",
      worktreeSlug: "improve-repository",
    });
  });
});
