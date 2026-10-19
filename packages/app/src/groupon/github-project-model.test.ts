// Added for Groupon Desk (fork of Paseo, Apache-2.0): the From GitHub sheet's steps.
import { describe, expect, it } from "vitest";
import type { GithubAccessAnswer, GithubRepository } from "./desk-plugin-rpc";
import {
  ALL_TEAMS,
  checkoutPathPreview,
  firstStep,
  folderProblem,
  matching,
  organisationHint,
  organisationsOf,
  previousStep,
  repositoriesOf,
  stepTitle,
  teamHint,
} from "./github-project-model";

const repo = (name: string, description: string | null = null): GithubRepository => ({
  name,
  fullName: `groupon2/${name}`,
  description,
  isPrivate: true,
  permission: "write",
});

const ANSWER: GithubAccessAnswer = {
  access: {
    githubLogin: "ctzaruba",
    requestAccessUrl: "https://admin.grpn.site/github-onboarding",
    organisations: [
      { login: "groupon-poc", purpose: "Proofs", membership: "not_member", teams: [] },
      {
        login: "groupon2",
        purpose: "The rebuild",
        membership: "member",
        teams: [
          {
            slug: "platform",
            name: "Platform",
            description: null,
            repositories: [
              repo("infra-development"),
              repo("engineering-development", "The monorepo"),
            ],
          },
          {
            slug: "web",
            name: "Web",
            description: "Frontends",
            repositories: [repo("engineering-development", "The monorepo")],
          },
          { slug: "silent", name: "Silent", description: null, repositories: null },
        ],
      },
    ],
  },
  problem: null,
  readAt: "2026-10-19T16:00:00.000Z",
  defaultFolder: "~/Documents/GitHub",
};

describe("the From GitHub steps", () => {
  it("lists the organisations the person is in first", () => {
    expect(organisationsOf(ANSWER).map((org) => org.login)).toEqual(["groupon2", "groupon-poc"]);
    expect(organisationsOf(null)).toEqual([]);
  });

  it("opens on the remembered organisation and team, else the first organisation the person is in", () => {
    expect(firstStep(ANSWER, { organisation: null, team: null })).toEqual({
      kind: "repositories",
      organisation: "groupon2",
      team: ALL_TEAMS,
    });
    expect(firstStep(ANSWER, { organisation: "groupon2", team: "web" })).toEqual({
      kind: "repositories",
      organisation: "groupon2",
      team: "web",
    });
    // A team that is gone, or an organisation the person left, falls back to all teams of the first.
    expect(firstStep(ANSWER, { organisation: "groupon2", team: "gone" })).toMatchObject({
      team: ALL_TEAMS,
    });
    expect(firstStep(ANSWER, { organisation: "groupon-poc", team: "web" })).toMatchObject({
      organisation: "groupon2",
      team: ALL_TEAMS,
    });
    expect(firstStep(null, { organisation: "groupon2", team: "web" })).toEqual({
      kind: "organisations",
    });
    const oneTeam: GithubAccessAnswer = {
      ...ANSWER,
      access: {
        githubLogin: "ctzaruba",
        requestAccessUrl: null,
        organisations: [
          {
            login: "groupon2",
            purpose: "",
            membership: "member",
            teams: [{ slug: "web", name: "Web", description: null, repositories: [] }],
          },
        ],
      },
    };
    expect(firstStep(oneTeam, { organisation: null, team: null })).toMatchObject({ team: "web" });
  });

  it("gathers every team's repositories once each, and names the teams GitHub did not answer for", () => {
    const org = ANSWER.access?.organisations[1] ?? null;
    const all = repositoriesOf(org, ALL_TEAMS);
    expect(all.repositories.map((row) => row.name)).toEqual([
      "engineering-development",
      "infra-development",
    ]);
    expect(all.unreadTeams).toEqual(["Silent"]);
    expect(repositoriesOf(org, "web").repositories).toHaveLength(1);
  });

  it("filters by every word typed", () => {
    const rows = [repo("engineering-development", "The monorepo"), repo("infra-development")];
    expect(matching(rows, "mono", (row) => `${row.name} ${row.description ?? ""}`)).toHaveLength(1);
    expect(matching(rows, "  ", (row) => row.name)).toHaveLength(2);
    expect(matching(rows, "dev infra", (row) => row.name).map((row) => row.name)).toEqual([
      "infra-development",
    ]);
  });

  it("shows where a download lands, and takes only a folder on the Mac", () => {
    expect(checkoutPathPreview("~/Documents/GitHub/", repo("x"))).toBe("~/Documents/GitHub/x");
    expect(folderProblem("~/Documents/GitHub")).toBeNull();
    expect(folderProblem("/Volumes/src")).toBeNull();
    expect(folderProblem("src")).toMatch(/Start the folder/);
    expect(folderProblem(" ")).toMatch(/Type the folder/);
  });

  it("goes back one step at a time and titles each step", () => {
    const folder = {
      kind: "folder" as const,
      organisation: "groupon2",
      team: ALL_TEAMS,
      repository: repo("x"),
    };
    expect(previousStep(folder)).toEqual({
      kind: "repositories",
      organisation: "groupon2",
      team: ALL_TEAMS,
    });
    expect(previousStep({ kind: "organisations" })).toBeNull();
    expect(stepTitle(folder, "From GitHub", "All your teams")).toBe("groupon2/x");
    expect(
      stepTitle(
        { kind: "repositories", organisation: "groupon2", team: ALL_TEAMS },
        "From GitHub",
        "All your teams",
      ),
    ).toBe("groupon2 · All your teams");
  });

  it("words the rows", () => {
    const [poc, rebuild] = ANSWER.access?.organisations ?? [];
    expect(poc && organisationHint(poc, "You are not in it yet")).toBe(
      "You are not in it yet · Proofs",
    );
    expect(rebuild && organisationHint(rebuild, "x")).toBe("3 teams · The rebuild");
    const silent = rebuild?.teams[2];
    expect(silent && teamHint(silent, "GitHub did not answer")).toBe("GitHub did not answer");
  });
});
