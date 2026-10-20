// Added for Groupon Desk (fork of Paseo, Apache-2.0): the home page's Your access, as the cards say it.
import { describe, expect, it } from "vitest";
import type { EncoreAppsAnswer, GithubAccessAnswer } from "./desk-plugin-rpc";
import {
  accessServerIdOf,
  encoreAccessRows,
  encoreAppTitle,
  encoreCountText,
  githubHostCard,
  githubHostTitle,
} from "./home-access-model";

const APPS: EncoreAppsAnswer = {
  apps: [
    {
      slug: "groupon-finance-s422",
      description:
        "Finance plane, in its own repository (groupon2/finance-development). Reaches Core.",
      repositoryUrl: "https://github.com/groupon2/finance-development",
      standing: "not-member",
      role: null,
      requestPending: false,
      approver: "owner@groupon.com",
    },
    {
      slug: "groupon-core-v3s2",
      description: "Core plane. The daily-business backend.",
      repositoryUrl: "https://github.com/groupon2/engineering-development",
      standing: "member",
      role: "owner",
      requestPending: false,
      approver: "owner@groupon.com",
    },
    {
      slug: "groupon-internal-nszi",
      description: "",
      repositoryUrl: null,
      standing: "unknown",
      role: null,
      requestPending: true,
      approver: null,
    },
  ],
  problem: null,
  environment: "production",
  readAt: "2026-10-20T12:00:00.000Z",
};

describe("accessServerIdOf", () => {
  it("reads on the Mac the window runs beside, else the first one", () => {
    const hosts = [{ serverId: "a" }, { serverId: "b" }];
    expect(accessServerIdOf("b", hosts)).toBe("b");
    expect(accessServerIdOf(null, hosts)).toBe("a");
    expect(accessServerIdOf("gone", hosts)).toBe("a");
    expect(accessServerIdOf(null, [])).toBeNull();
  });
});

describe("the Encore card", () => {
  it("names an app by its description's first words, else its id", () => {
    expect(
      encoreAppTitle({ slug: "x", description: "Core plane. The daily-business backend." }),
    ).toBe("Core plane");
    expect(
      encoreAppTitle({ slug: "x", description: "Finance plane, in its own repository." }),
    ).toBe("Finance plane");
    expect(encoreAppTitle({ slug: "groupon-x", description: "" })).toBe("groupon-x");
  });

  it("lists the apps you are in first, with Ask for access where it helps", () => {
    expect(encoreAccessRows(APPS)).toEqual([
      {
        slug: "groupon-core-v3s2",
        title: "Core plane",
        standing: "You are a member (owner)",
        tone: "good",
        offer: "none",
      },
      {
        slug: "groupon-internal-nszi",
        title: "groupon-internal-nszi",
        standing: "Your request for access waits for a decision",
        tone: "neutral",
        offer: "none",
      },
      {
        slug: "groupon-finance-s422",
        title: "Finance plane",
        standing: "You are not a member",
        tone: "neutral",
        offer: "ask",
      },
    ]);
  });

  it("counts the apps you are a member of", () => {
    expect(encoreCountText(APPS)).toBe("You are a member of 1 of 3 apps.");
    expect(encoreCountText({ ...APPS, apps: [] })).toBeNull();
  });
});

const GITHUB_COM: GithubAccessAnswer = {
  host: "github.com",
  hosts: [
    { host: "github.com", login: "ctzaruba", signIn: null },
    {
      host: "github.groupondev.com",
      login: null,
      signIn: "gh auth login --hostname github.groupondev.com --web",
    },
  ],
  access: {
    githubLogin: "ctzaruba",
    requestAccessUrl: "https://admin.livingsocial.com/github-onboarding",
    organisations: [
      { login: "data-platform-groupon", purpose: "", membership: "not_member", teams: [] },
      {
        login: "groupon2",
        purpose: "The rebuild.",
        membership: "member",
        teams: [
          { slug: "platform", name: "Platform", description: null, repositories: [] },
          { slug: "b2b", name: "B2B", description: null, repositories: null },
        ],
      },
      { login: "Groupon-POC", purpose: "", membership: "member", teams: [] },
    ],
    otherOrganisations: null,
  },
  problem: null,
  readAt: "2026-10-20T12:00:00.000Z",
  defaultFolder: "~/Documents/GitHub",
};

describe("the GitHub card", () => {
  it("lists your organisations first with their teams, and where to ask", () => {
    expect(githubHostCard("github.com", GITHUB_COM)).toEqual({
      kind: "access",
      host: "github.com",
      login: "ctzaruba",
      organisations: [
        { login: "groupon2", detail: "Platform, B2B", member: true },
        { login: "Groupon-POC", detail: "no team", member: true },
        { login: "data-platform-groupon", detail: "not in it yet", member: false },
      ],
      others: null,
      askUrl: "https://admin.livingsocial.com/github-onboarding",
    });
  });

  it("shows the command that signs gh in to a host it is not signed in to", () => {
    const enterprise = {
      ...GITHUB_COM,
      host: "github.groupondev.com",
      access: null,
      problem: "gh on this Mac is not signed in to github.groupondev.com",
    };
    expect(githubHostCard("github.groupondev.com", enterprise)).toEqual({
      kind: "signed-out",
      host: "github.groupondev.com",
      signIn: "gh auth login --hostname github.groupondev.com --web",
    });
  });

  it("says why nothing could be read", () => {
    const failed = { ...GITHUB_COM, access: null, problem: "groupon github could not read it" };
    expect(githubHostCard("github.com", failed)).toEqual({
      kind: "problem",
      host: "github.com",
      problem: "groupon github could not read it",
    });
  });

  it("counts the other organisations on an enterprise", () => {
    const enterprise: GithubAccessAnswer = {
      ...GITHUB_COM,
      host: "github.groupondev.com",
      hosts: [{ host: "github.groupondev.com", login: "c-tzaruba", signIn: null }],
      access: {
        githubLogin: "c-tzaruba",
        requestAccessUrl: null,
        organisations: [],
        otherOrganisations: ["Mobile-Next", "sox"],
      },
    };
    expect(githubHostCard("github.groupondev.com", enterprise)).toMatchObject({
      kind: "access",
      login: "c-tzaruba",
      organisations: [],
      others: 2,
      askUrl: null,
    });
    expect(githubHostTitle("github.groupondev.com")).toBe(
      "GitHub Enterprise (github.groupondev.com)",
    );
  });
});
