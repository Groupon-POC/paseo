// Added for Groupon Desk (fork of Paseo, Apache-2.0): the Groupon plugin's RPCs as the app reads them.
import { describe, expect, it } from "vitest";
import {
  followJob,
  GROUPON_PLUGIN_ID,
  GROUPON_RPC,
  isJobAnswer,
  isProjectSettingsAnswer,
  pluginProblemText,
  readGithubAccess,
  startTicketJob,
  type PluginRpcClient,
} from "./desk-plugin-rpc";

// The same sample answers as the plugin's own tests/rpc.test.ts (monorepo packages/desk-paseo-plugin).
const SAMPLE_JOB_STARTED = {
  jobId: "6f1c7c2e-0000-4000-8000-000000000000",
  kind: "ticket-start",
  status: "done",
  phase: "Cutting the worktree on b2b/QR-1742/ENC-1234-fix and starting the agent",
  error: null,
  clone: null,
  ticket: {
    kind: "started",
    ticket: "ENC-1234",
    branch: "b2b/QR-1742/ENC-1234-fix",
    readiness: "READY",
    workspaceId: "wks_0123456789abcdef",
    agentId: null,
  },
  updatedAt: "2026-10-19T16:00:00.000Z",
};

const SAMPLE_PROJECT_SETTINGS = {
  settings: {
    setup: "pnpm install",
    archive: null,
    runMode: "concurrent",
    run: [{ id: "core", command: "pnpm backend:core", icon: "server", isDefault: true }],
    prompts: { create_pr: "Open the PR.", commit_messages: "Conventional commit." },
    targetBranch: "staging",
    deleteBranchOnArchive: false,
    envRequired: [],
  },
  source: "default-branch",
  branch: "staging",
  fileUrl: "https://github.com/groupon2/engineering-development/blob/staging/.groupon/desk.toml",
  fetchedAt: "2026-10-19T16:00:00.000Z",
  problem: null,
};

function fakeClient(answers: Record<string, unknown[]>) {
  const calls: { pluginId: string; method: string; input: unknown }[] = [];
  const client: PluginRpcClient = {
    async invokePluginRpc(pluginId, method, input) {
      calls.push({ pluginId, method, input });
      const queue = answers[method] ?? [];
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { client, calls };
}

describe("the Groupon plugin's RPCs", () => {
  it("keeps the plugin's names", () => {
    expect(GROUPON_PLUGIN_ID).toBe("groupon");
    expect(GROUPON_RPC).toEqual({
      githubAccess: "groupon.github-access",
      githubClone: "groupon.github-clone",
      ticketStart: "groupon.ticket-start",
      job: "groupon.job",
      ticketFlow: "groupon.ticket-flow",
      projectSettings: "groupon.project-settings",
    });
  });

  it("reads the plugin's sample answers", () => {
    expect(isJobAnswer(SAMPLE_JOB_STARTED)).toBe(true);
    expect(isProjectSettingsAnswer(SAMPLE_PROJECT_SETTINGS)).toBe(true);
    expect(isJobAnswer({ jobId: "x" })).toBe(false);
  });

  it("calls the groupon plugin with the method and the input", async () => {
    const { client, calls } = fakeClient({
      [GROUPON_RPC.githubAccess]: [
        {
          access: null,
          problem: "not signed in",
          readAt: null,
          defaultFolder: "~/Documents/GitHub",
        },
      ],
      [GROUPON_RPC.ticketStart]: [{ jobId: "job-1" }],
    });
    expect((await readGithubAccess(client, true)).problem).toBe("not signed in");
    expect(
      await startTicketJob(client, {
        ticket: "ENC-1234",
        projectRoot: "/r",
        provider: "claude",
        model: "opus",
      }),
    ).toBe("job-1");
    expect(calls.map(({ pluginId, method, input }) => [pluginId, method, input])).toEqual([
      ["groupon", "groupon.github-access", { refresh: true }],
      [
        "groupon",
        "groupon.ticket-start",
        { ticket: "ENC-1234", projectRoot: "/r", provider: "claude", model: "opus" },
      ],
    ]);
  });

  it("follows a job until it ends, and stops when the screen goes away", async () => {
    const running = { ...SAMPLE_JOB_STARTED, status: "running", ticket: null, phase: "Grading" };
    const { client } = fakeClient({ [GROUPON_RPC.job]: [running, running, SAMPLE_JOB_STARTED] });
    const phases: string[] = [];
    const sleep = async () => {};
    const job = await followJob(
      client,
      "job-1",
      (next) => phases.push(next.phase),
      () => true,
      sleep,
    );
    expect(job?.status).toBe("done");
    expect(phases).toEqual(["Grading", "Grading", SAMPLE_JOB_STARTED.phase]);
    expect(
      await followJob(
        client,
        "job-1",
        () => {},
        () => false,
        sleep,
      ),
    ).toBeNull();
  });

  it("says what to do when the daemon has no Groupon plugin, or an older one", () => {
    expect(pluginProblemText(new Error("Plugin is not available: groupon"))).toMatch(
      /groupon desk serve/,
    );
    expect(
      pluginProblemText(new Error("Plugin groupon does not contribute RPC groupon.ticket-start")),
    ).toMatch(/older than this app/);
    expect(pluginProblemText(new Error("boom"))).toBe("boom");
  });
});
