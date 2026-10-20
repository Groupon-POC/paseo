// Added for Groupon Desk (fork of Paseo, Apache-2.0): the From GitHub sheet's steps, on github.com and on the enterprise.
import { describe, expect, it } from "vitest";
import type { GithubAccessAnswer, GithubRepository } from "./desk-plugin-rpc";
import {
  ALL_TEAMS,
  browsesOrganisation,
  checkoutPathPreview,
  firstStep,
  folderProblem,
  GITHUB_COM,
  GITHUB_ENTERPRISE,
  hostChoices,
  isSsoBlock,
  matching,
  organisationHint,
  organisationsOf,
  OTHER_ORGANISATIONS_SHOWN,
  otherOrganisationsMatching,
  placeOn,
  prefilledStep,
  previousStep,
  repositoriesOf,
  signInNeeded,
  ssoRefreshCommand,
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

const SIGN_IN = `gh auth login --hostname ${GITHUB_ENTERPRISE} --web`;

/** The enterprise as the plugin answers it: one organisation with a team, and every other one by name. */
const ENTERPRISE: GithubAccessAnswer = {
  host: GITHUB_ENTERPRISE,
  hosts: [
    { host: GITHUB_COM, login: "ctzaruba", signIn: null },
    { host: GITHUB_ENTERPRISE, login: "c-tzaruba", signIn: null },
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
            repositories: [repo("smc")],
          },
        ],
      },
      { login: "lonely", purpose: "", membership: "member", teams: [] },
    ],
    otherOrganisations: ["Mobile-Next", "Mobile-Old", "US"],
  },
  problem: null,
  readAt: "2026-10-19T16:00:00.000Z",
  defaultFolder: "~/Documents/GitHub",
};

describe("From GitHub on two hosts", () => {
  it("always offers github.com and the enterprise, then any other host gh is signed in to", () => {
    expect(hostChoices(null)).toEqual([GITHUB_COM, GITHUB_ENTERPRISE]);
    const third: GithubAccessAnswer = {
      ...ENTERPRISE,
      hosts: [...(ENTERPRISE.hosts ?? []), { host: "ghe.example.com", login: "me", signIn: null }],
    };
    expect(hostChoices(third)).toEqual([GITHUB_COM, GITHUB_ENTERPRISE, "ghe.example.com"]);
  });

  it("shows the sign-in command for the answer's own host only when gh is not signed in there", () => {
    expect(signInNeeded(ENTERPRISE)).toBeNull();
    const signedOut: GithubAccessAnswer = {
      host: GITHUB_ENTERPRISE,
      hosts: [
        { host: GITHUB_COM, login: "ctzaruba", signIn: null },
        { host: GITHUB_ENTERPRISE, login: null, signIn: SIGN_IN },
      ],
      access: null,
      problem: "not signed in",
      readAt: null,
      defaultFolder: "~/Documents/GitHub",
    };
    expect(signInNeeded(signedOut)).toEqual({
      host: GITHUB_ENTERPRISE,
      login: null,
      signIn: SIGN_IN,
    });
    // github.com's answer is not about the enterprise's sign-in; an older plugin says nothing.
    expect(signInNeeded({ ...signedOut, host: GITHUB_COM })).toBeNull();
    expect(signInNeeded(ANSWER)).toBeNull();
  });

  it("remembers a place per host, github.com falling back to the place kept before hosts", () => {
    const kept = {
      githubOrganisation: "groupon2",
      githubTeam: "web",
      githubPlaces: { [GITHUB_ENTERPRISE]: { organisation: "Mobile-Next", team: ALL_TEAMS } },
    };
    expect(placeOn(kept, GITHUB_COM)).toEqual({ organisation: "groupon2", team: "web" });
    expect(placeOn(kept, GITHUB_ENTERPRISE)).toEqual({
      organisation: "Mobile-Next",
      team: ALL_TEAMS,
    });
    expect(placeOn({}, "ghe.example.com")).toEqual({ organisation: null, team: null });
    expect(
      placeOn(
        { ...kept, githubPlaces: { [GITHUB_COM]: { organisation: "groupon-poc", team: null } } },
        GITHUB_COM,
      ),
    ).toEqual({ organisation: "groupon-poc", team: null });
  });

  it("opens another organisation, or one without a team of the person's, on its own repositories, only on the enterprise", () => {
    expect(browsesOrganisation(ENTERPRISE, "Mobile-Next")).toBe(true);
    expect(browsesOrganisation(ENTERPRISE, "lonely")).toBe(true);
    expect(browsesOrganisation(ENTERPRISE, "merchant-experience")).toBe(false);
    expect(browsesOrganisation(ANSWER, "groupon-poc")).toBe(false);
  });

  it("finds other organisations by name once something is typed, a bounded number", () => {
    expect(otherOrganisationsMatching(ENTERPRISE, "")).toEqual([]);
    expect(otherOrganisationsMatching(ENTERPRISE, "mobile next")).toEqual(["Mobile-Next"]);
    expect(otherOrganisationsMatching(ENTERPRISE, "mobile")).toEqual(["Mobile-Next", "Mobile-Old"]);
    const many: GithubAccessAnswer = {
      ...ENTERPRISE,
      access: ENTERPRISE.access && {
        ...ENTERPRISE.access,
        otherOrganisations: Array.from({ length: 100 }, (_, i) => `org-${i}`),
      },
    };
    expect(otherOrganisationsMatching(many, "org")).toHaveLength(OTHER_ORGANISATIONS_SHOWN);
    expect(otherOrganisationsMatching(ANSWER, "groupon")).toEqual([]);
  });

  it("reopens the enterprise on the organisation opened last time, while it is still there", () => {
    expect(firstStep(ENTERPRISE, { organisation: "Mobile-Next", team: ALL_TEAMS })).toEqual({
      kind: "repositories",
      organisation: "Mobile-Next",
      team: ALL_TEAMS,
    });
    expect(firstStep(ENTERPRISE, { organisation: "gone", team: null })).toEqual({
      kind: "repositories",
      organisation: "merchant-experience",
      team: "mx-galactic-bridge",
    });
    expect(firstStep(ENTERPRISE, { organisation: null, team: null })).toMatchObject({
      organisation: "merchant-experience",
    });
  });

  it("goes back from another organisation's repositories to the organisations, and titles it by its name", () => {
    const browsed = { kind: "repositories" as const, organisation: "Mobile-Next", team: ALL_TEAMS };
    expect(previousStep(browsed, ENTERPRISE)).toEqual({ kind: "organisations" });
    expect(stepTitle(browsed, "From GitHub", "All your teams", ENTERPRISE)).toBe("Mobile-Next");
    const team = { ...browsed, organisation: "merchant-experience", team: "mx-galactic-bridge" };
    expect(previousStep(team, ENTERPRISE)).toEqual({
      kind: "teams",
      organisation: "merchant-experience",
    });
  });
});

describe("prefilledStep", () => {
  it("opens New workspace's clone at the folder step of the repository it names", () => {
    const step = prefilledStep("groupon2/infra-development");
    expect(step).toEqual({
      kind: "folder",
      organisation: "groupon2",
      team: ALL_TEAMS,
      repository: {
        name: "infra-development",
        fullName: "groupon2/infra-development",
        description: null,
        isPrivate: true,
        permission: null,
      },
    });
    expect(
      step &&
        checkoutPathPreview(
          "~/Documents/GitHub/",
          step.kind === "folder" ? step.repository : repo("x"),
        ),
    ).toBe("~/Documents/GitHub/infra-development");
  });

  it("names no step for anything that is not owner/name", () => {
    expect(prefilledStep("infra-development")).toBeNull();
    expect(prefilledStep("group/sub/repo")).toBeNull();
  });
});

/** gh's words for the 403 the `groupon` organisation answers a token SSO has not authorised (MEASURED 2026-10-20). */
const SAML_403 =
  "gh could not read orgs/groupon/teams/encore-platform/repos?per_page=100 on github.com: gh: Resource protected by organization SAML enforcement. You must grant your OAuth token access to this organization. (HTTP 403)";

describe("single sign-on in the way", () => {
  it("knows GitHub's SAML refusal and nothing else", () => {
    expect(isSsoBlock(SAML_403)).toBe(true);
    expect(isSsoBlock("Resource protected by organization SAML enforcement.")).toBe(true);
    expect(isSsoBlock("gh: Not Found (HTTP 404)")).toBe(false);
    expect(isSsoBlock("gh: Must have admin rights to Repository. (HTTP 403)")).toBe(false);
    expect(isSsoBlock(null)).toBe(false);
    expect(isSsoBlock(undefined)).toBe(false);
  });

  it("names the command that asks for the authorisation on the host", () => {
    expect(ssoRefreshCommand(GITHUB_COM)).toBe("gh auth refresh -h github.com -s read:org");
  });

  it("says single sign-on blocks a team when the plugin carries GitHub's reason", () => {
    const blocked = {
      slug: "encore-platform",
      name: "encore-platform",
      description: null,
      repositories: null,
      problem: SAML_403,
    };
    const org = {
      login: "groupon",
      purpose: "",
      membership: "member",
      teams: [blocked, { slug: "silent", name: "Silent", description: null, repositories: null }],
    };
    const all = repositoriesOf(org, ALL_TEAMS);
    expect(all.ssoBlocked).toBe(true);
    expect(all.unreadTeams).toEqual(["encore-platform", "Silent"]);
    expect(repositoriesOf(org, "silent").ssoBlocked).toBe(false);
    expect(teamHint(blocked, "GitHub did not answer", "Single sign-on blocks it")).toBe(
      "Single sign-on blocks it",
    );
    // A plugin that gives no reason keeps the old line.
    expect(teamHint(org.teams[1] ?? blocked, "GitHub did not answer", "Single sign-on")).toBe(
      "GitHub did not answer",
    );
  });
});
