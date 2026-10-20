// Added for Groupon Desk (fork of Paseo, Apache-2.0): the Groupon plugin's RPCs as the app reads them.
import { describe, expect, it } from "vitest";
import {
  followJob,
  GROUPON_PLUGIN_ID,
  GROUPON_RPC,
  isGithubAccessAnswer,
  isGithubRepositoriesAnswer,
  isJobAnswer,
  isEncoreAccessAnswer,
  isEncoreStateAnswer,
  isJiraFieldsAnswer,
  isJiraSavedViewAnswer,
  isJiraSearchAnswer,
  isProjectSettingsAnswer,
  jiraSavedView,
  readJiraFields,
  searchJira,
  readEncoreState,
  requestEncoreAccess,
  pluginProblemText,
  readGithubAccess,
  readGithubRepositories,
  startGithubClone,
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

/** The access on GitHub Enterprise, with both hosts. */
const SAMPLE_ENTERPRISE_ACCESS = {
  host: "github.groupondev.com",
  hosts: [
    { host: "github.com", login: "ctzaruba", signIn: null },
    { host: "github.groupondev.com", login: "c-tzaruba", signIn: null },
  ],
  access: {
    githubLogin: "c-tzaruba",
    requestAccessUrl: null,
    organisations: [
      {
        login: "merchant-experience",
        purpose: "",
        membership: "member",
        teams: [
          {
            slug: "mx-galactic-bridge",
            name: "MX Galactic Bridge",
            description: null,
            repositories: [
              {
                name: "access-service",
                fullName: "merchant-experience/access-service",
                description: "Merchant Access Service",
                isPrivate: false,
                permission: "write",
              },
            ],
          },
        ],
      },
    ],
    otherOrganisations: ["Mobile-Next"],
  },
  problem: null,
  readAt: "2026-10-19T16:00:00.000Z",
  defaultFolder: "~/Documents/GitHub",
};

/** A host gh is not signed in to: no access, the command in the host row. */
const SAMPLE_SIGNED_OUT = {
  host: "github.groupondev.com",
  hosts: [
    { host: "github.com", login: "ctzaruba", signIn: null },
    {
      host: "github.groupondev.com",
      login: null,
      signIn: "gh auth login --hostname github.groupondev.com --web",
    },
  ],
  access: null,
  problem:
    "gh on this Mac is not signed in to github.groupondev.com: run gh auth login --hostname github.groupondev.com --web",
  readAt: null,
  defaultFolder: "~/Documents/GitHub",
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

const SAMPLE_ENCORE_STATE = {
  configured: true,
  apps: [
    {
      key: "core",
      slug: "groupon-core-v3s2",
      name: "Core",
      standing: "not-member",
      role: null,
      requestPending: false,
      approver: "owner@groupon.com",
      environments: [
        {
          environment: "staging",
          rollout: {
            rolloutId: "roll_abc",
            status: "completed",
            conclusion: "success",
            commitShort: "0b67a96a02",
            queuedAt: "2026-10-19T08:00:00.000Z",
            startedAt: "2026-10-19T08:01:00.000Z",
            completedAt: "2026-10-19T08:11:00.000Z",
            dashboardUrl: "https://app.encore.cloud/groupon-core-v3s2/envs/staging/deploys/abc",
          },
        },
        { environment: "production", rollout: null },
      ],
    },
  ],
  appsProblem: null,
  releases: { base: "production" },
  train: {
    number: 344,
    title: "STG -> PRD 2026-10-19 Train (12 commits)",
    url: "https://github.com/groupon2/engineering-development/pull/344",
    checks: "pending",
    createdAt: "2026-10-19T06:00:00Z",
  },
  trainProblem: null,
  fileProblems: [],
  environment: "production",
  readAt: "2026-10-19T16:00:00.000Z",
};

const SAMPLE_ENCORE_REQUEST = {
  slug: "groupon-core-v3s2",
  state: "filed",
  message: "Access request submitted",
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

const SAMPLE_JIRA_FIELD = {
  id: "summary",
  name: "Summary",
  kind: "text",
  custom: false,
  sortable: true,
  clauseName: "summary",
};

const SAMPLE_JIRA_SEARCH = {
  page: {
    data: [
      {
        key: "ENC-10373",
        url: "https://groupondev.atlassian.net/browse/ENC-10373",
        cells: {
          summary: { text: "Count the paid orders", iconUrl: null, url: null, category: null },
          status: { text: "To Do", iconUrl: null, url: null, category: "todo" },
        },
      },
    ],
    nextCursor: "tok-2",
    total: 151,
    fields: [SAMPLE_JIRA_FIELD],
    jql: '(assignee = "712020:abc") AND (status = "To Do") ORDER BY created DESC',
  },
  problem: null,
};

const SAMPLE_JIRA_SIGNED_OUT = {
  page: null,
  problem: {
    kind: "signed-out",
    message: "The groupon CLI on this Mac is not signed in: run groupon login there.",
  },
};

const SAMPLE_JIRA_VIEW = {
  view: {
    jql: 'assignee = currentUser() AND status = "To Do" ORDER BY created DESC',
    columns: ["issuekey", "summary"],
    updatedAt: "2026-10-20T10:00:00.000Z",
  },
  problem: null,
};

describe("the Groupon plugin's RPCs", () => {
  it("keeps the plugin's names", () => {
    expect(GROUPON_PLUGIN_ID).toBe("groupon");
    expect(GROUPON_RPC).toEqual({
      githubAccess: "groupon.github-access",
      githubClone: "groupon.github-clone",
      githubRepositories: "groupon.github-repositories",
      ticketStart: "groupon.ticket-start",
      job: "groupon.job",
      ticketFlow: "groupon.ticket-flow",
      projectSettings: "groupon.project-settings",
      encoreState: "groupon.encore-state",
      requestEncoreAccess: "groupon.encore-request-access",
      jiraSearch: "groupon.jira-search",
      jiraFields: "groupon.jira-fields",
      jiraSavedView: "groupon.jira-saved-view",
    });
  });

  it("reads My tasks' sample answers and refuses another shape", () => {
    expect(isJiraSearchAnswer(SAMPLE_JIRA_SEARCH)).toBe(true);
    expect(isJiraSearchAnswer(SAMPLE_JIRA_SIGNED_OUT)).toBe(true);
    expect(isJiraSearchAnswer({ page: { rows: [] }, problem: null })).toBe(false);
    expect(isJiraFieldsAnswer({ fields: [SAMPLE_JIRA_FIELD], problem: null })).toBe(true);
    expect(isJiraSavedViewAnswer(SAMPLE_JIRA_VIEW)).toBe(true);
    expect(isJiraSavedViewAnswer({ view: null, problem: null })).toBe(true);
  });

  it("searches, reads the fields and saves the view through the plugin", async () => {
    const { client, calls } = fakeClient({
      [GROUPON_RPC.jiraSearch]: [SAMPLE_JIRA_SEARCH],
      [GROUPON_RPC.jiraFields]: [{ fields: [SAMPLE_JIRA_FIELD], problem: null }],
      [GROUPON_RPC.jiraSavedView]: [SAMPLE_JIRA_VIEW],
    });
    const input = { jql: "status = Done", fields: ["summary"], cursor: null, limit: 25 };

    expect((await searchJira(client, input)).page?.total).toBe(151);
    expect((await readJiraFields(client, false)).fields).toHaveLength(1);
    const save = { jql: "status = Done ORDER BY created DESC", columns: ["summary"] };
    expect((await jiraSavedView(client, save)).view?.columns).toEqual(["issuekey", "summary"]);
    expect(calls.map(({ method, input: sent }) => [method, sent])).toEqual([
      ["groupon.jira-search", input],
      ["groupon.jira-fields", { refresh: false }],
      ["groupon.jira-saved-view", { save }],
    ]);
  });

  it("reads the plugin's sample answers", () => {
    expect(isJobAnswer(SAMPLE_JOB_STARTED)).toBe(true);
    expect(isProjectSettingsAnswer(SAMPLE_PROJECT_SETTINGS)).toBe(true);
    expect(isJobAnswer({ jobId: "x" })).toBe(false);
    expect(isGithubAccessAnswer(SAMPLE_ENTERPRISE_ACCESS)).toBe(true);
    expect(isGithubAccessAnswer(SAMPLE_SIGNED_OUT)).toBe(true);
    expect(isGithubRepositoriesAnswer({ repositories: null, problem: "gh: Not Found" })).toBe(true);
    expect(isGithubRepositoriesAnswer({ problem: null })).toBe(false);
    expect(isEncoreStateAnswer(SAMPLE_ENCORE_STATE)).toBe(true);
    expect(isEncoreAccessAnswer(SAMPLE_ENCORE_REQUEST)).toBe(true);
    expect(isEncoreAccessAnswer({ ...SAMPLE_ENCORE_REQUEST, state: "granted" })).toBe(false);
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
      [GROUPON_RPC.githubRepositories]: [{ repositories: [], problem: null }],
      [GROUPON_RPC.githubClone]: [{ jobId: "job-2" }],
    });
    expect((await readGithubAccess(client, "github.com", true)).problem).toBe("not signed in");
    expect(
      await startTicketJob(client, {
        ticket: "ENC-1234",
        projectRoot: "/r",
        provider: "claude",
        model: "opus",
      }),
    ).toBe("job-1");
    expect(
      (await readGithubRepositories(client, "github.groupondev.com", "Mobile-Next", false))
        .repositories,
    ).toEqual([]);
    expect(
      await startGithubClone(client, "github.groupondev.com", "Mobile-Next/next-pwa-app", "~/src"),
    ).toBe("job-2");
    expect(calls.map(({ pluginId, method, input }) => [pluginId, method, input])).toEqual([
      ["groupon", "groupon.github-access", { refresh: true, host: "github.com" }],
      [
        "groupon",
        "groupon.ticket-start",
        { ticket: "ENC-1234", projectRoot: "/r", provider: "claude", model: "opus" },
      ],
      [
        "groupon",
        "groupon.github-repositories",
        { host: "github.groupondev.com", organisation: "Mobile-Next", refresh: false },
      ],
      [
        "groupon",
        "groupon.github-clone",
        {
          fullName: "Mobile-Next/next-pwa-app",
          folder: "~/src",
          host: "github.groupondev.com",
        },
      ],
    ]);
  });

  it("reads the Encore card and files a request through the plugin", async () => {
    const { client, calls } = fakeClient({
      [GROUPON_RPC.encoreState]: [SAMPLE_ENCORE_STATE],
      [GROUPON_RPC.requestEncoreAccess]: [SAMPLE_ENCORE_REQUEST],
    });
    expect((await readEncoreState(client, "/r")).train?.number).toBe(344);
    expect((await requestEncoreAccess(client, "groupon-core-v3s2")).state).toBe("filed");
    expect(calls.map(({ method, input }) => [method, input])).toEqual([
      ["groupon.encore-state", { projectRoot: "/r" }],
      ["groupon.encore-request-access", { slug: "groupon-core-v3s2" }],
    ]);
  });

  it("refuses an Encore card of another shape", async () => {
    const { client } = fakeClient({ [GROUPON_RPC.encoreState]: [{ configured: true }] });
    await expect(readEncoreState(client, "/r")).rejects.toThrow(/shape/);
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
