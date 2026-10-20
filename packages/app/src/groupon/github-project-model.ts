// Added for Groupon Desk (fork of Paseo, Apache-2.0): the From GitHub sheet's steps, as plain data.

/**
 * Add a project, From GitHub, on one GitHub host at a time (github.com, or Groupon's enterprise
 * github.groupondev.com; a switch at the top): the person's organisations (on github.com as the
 * platform sees them, on the enterprise as gh reads them, both through the Groupon plugin on the
 * Mac), then a team, then one of the team's repositories, then the folder it is cloned into. On
 * the enterprise any other organisation can be found by name and opened on its visible
 * repositories (Mobile-Next's next-pwa-app is one), with no team step. The sheet opens on the
 * host, organisation and team chosen last time (or the first organisation the person is in, all
 * teams), the way Desk's Dark Factory screen remembers its organisation; Back reaches the teams
 * and the organisations. New workspace opens it on one repository already chosen (a Mac that
 * lacks the repository the person picked): straight at the folder step (`prefilledStep`).
 * Pure, so the steps and the lists are tested without a screen.
 */

import type {
  GithubAccessAnswer,
  GithubHost,
  GithubOrganisation,
  GithubRepository,
  GithubTeam,
} from "./desk-plugin-rpc";

/** github.com: the `groupon2` organisations, as the platform sees them. */
export const GITHUB_COM = "github.com";
/** Groupon's GitHub Enterprise, where the inherited code lives. */
export const GITHUB_ENTERPRISE = "github.groupondev.com";
const KNOWN_HOSTS = [GITHUB_COM, GITHUB_ENTERPRISE];

/** The hosts the switch offers: the two known ones always, then any other the plugin lists. */
export function hostChoices(answer: GithubAccessAnswer | null): string[] {
  const others = (answer?.hosts ?? [])
    .map((row) => row.host)
    .filter((host) => !KNOWN_HOSTS.includes(host));
  return [...KNOWN_HOSTS, ...others];
}

/** The answer's own host row when gh on the Mac is not signed in there; null when it is (or an older plugin did not say). */
export function signInNeeded(answer: GithubAccessAnswer | null): GithubHost | null {
  const host = answer?.host ?? GITHUB_COM;
  const row = answer?.hosts?.find((entry) => entry.host === host) ?? null;
  return row && row.login === null && row.signIn ? row : null;
}

/** A team row that stands for every team of the organisation together. */
export const ALL_TEAMS = "*";

export type GithubStep =
  | { kind: "organisations" }
  | { kind: "teams"; organisation: string }
  | { kind: "repositories"; organisation: string; team: string }
  | { kind: "folder"; organisation: string; team: string; repository: GithubRepository };

export function organisationsOf(answer: GithubAccessAnswer | null): GithubOrganisation[] {
  const all = answer?.access?.organisations ?? [];
  // Members first: those are the ones with teams to pick from.
  return [...all].sort(
    (a, b) => Number(b.membership === "member") - Number(a.membership === "member"),
  );
}

export function organisationOf(
  answer: GithubAccessAnswer | null,
  login: string,
): GithubOrganisation | null {
  return answer?.access?.organisations.find((org) => org.login === login) ?? null;
}

/** The repositories of one team, or of every team of the organisation (`ALL_TEAMS`), once each, by name. */
export function repositoriesOf(
  organisation: GithubOrganisation | null,
  team: string,
): { repositories: GithubRepository[]; unreadTeams: string[] } {
  const teams: GithubTeam[] =
    organisation?.teams.filter((row) => team === ALL_TEAMS || row.slug === team) ?? [];
  const byName = new Map<string, GithubRepository>();
  const unreadTeams: string[] = [];
  for (const row of teams) {
    if (row.repositories === null) {
      unreadTeams.push(row.name);
      continue;
    }
    for (const repository of row.repositories) byName.set(repository.fullName, repository);
  }
  const repositories = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { repositories, unreadTeams };
}

/** The organisation and team the person picked last time, as remembered on this device. */
export interface RememberedGithubPlace {
  organisation: string | null;
  team: string | null;
}

/** What the device keeps: a place per host, and the github.com place of a version before the host switch. */
export interface RememberedGithubPlaces {
  githubPlaces?: Record<string, RememberedGithubPlace> | null;
  githubOrganisation?: string | null;
  githubTeam?: string | null;
}

/** The place remembered on a host; github.com falls back to the single place kept before hosts. */
export function placeOn(remembered: RememberedGithubPlaces, host: string): RememberedGithubPlace {
  const kept = remembered.githubPlaces?.[host];
  if (kept) return kept;
  if (host === GITHUB_COM) {
    return {
      organisation: remembered.githubOrganisation ?? null,
      team: remembered.githubTeam ?? null,
    };
  }
  return { organisation: null, team: null };
}

/**
 * True when an organisation opens on its own repositories, read on request, rather than on its
 * teams: on a host that lets the person browse other organisations (the enterprise), any
 * organisation they are on no team in.
 */
export function browsesOrganisation(answer: GithubAccessAnswer | null, login: string): boolean {
  if (!answer?.access?.otherOrganisations) return false;
  const organisation = organisationOf(answer, login);
  return !organisation || organisation.membership !== "member" || organisation.teams.length === 0;
}

/** How many other organisations a search shows at most. */
export const OTHER_ORGANISATIONS_SHOWN = 30;

/** The other organisations whose name holds every word typed; none until something is typed. */
export function otherOrganisationsMatching(
  answer: GithubAccessAnswer | null,
  query: string,
): string[] {
  const others = answer?.access?.otherOrganisations ?? [];
  if (query.trim() === "") return [];
  return matching(others, query, (login) => login).slice(0, OTHER_ORGANISATIONS_SHOWN);
}

/**
 * Where the sheet opens: the remembered organisation and team while the person is still in them
 * (on the enterprise, also another organisation opened before, while it is still there), else the
 * first organisation they are in with all its teams (its one team when it has one); the
 * organisations list when they are in none.
 */
export function firstStep(
  answer: GithubAccessAnswer | null,
  remembered: RememberedGithubPlace,
): GithubStep {
  const browsed = remembered.organisation;
  if (
    browsed &&
    browsesOrganisation(answer, browsed) &&
    (organisationOf(answer, browsed) || answer?.access?.otherOrganisations?.includes(browsed))
  ) {
    return { kind: "repositories", organisation: browsed, team: ALL_TEAMS };
  }
  const members = organisationsOf(answer).filter((org) => org.membership === "member");
  const organisation =
    members.find((org) => org.login === remembered.organisation) ?? members[0] ?? null;
  if (!organisation) return { kind: "organisations" };
  const keptTeam =
    organisation.login === remembered.organisation &&
    (remembered.team === ALL_TEAMS ||
      organisation.teams.some((team) => team.slug === remembered.team))
      ? remembered.team
      : null;
  const onlyTeam = organisation.teams.length === 1 ? (organisation.teams[0]?.slug ?? null) : null;
  return {
    kind: "repositories",
    organisation: organisation.login,
    team: keptTeam ?? onlyTeam ?? ALL_TEAMS,
  };
}

/** The rows whose name or description holds every word typed, case aside. */
export function matching<Row>(rows: Row[], query: string, text: (row: Row) => string): Row[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return rows;
  return rows.filter((row) => {
    const haystack = text(row).toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** `<folder>/<name>`, what the person sees before the download starts. */
export function checkoutPathPreview(folder: string, repository: GithubRepository): string {
  return `${folder.trim().replace(/\/+$/, "")}/${repository.name}`;
}

/** A folder the Mac can take: absolute, or under the home (`~`). Null when it is one, else why not. */
export function folderProblem(folder: string): string | null {
  const trimmed = folder.trim();
  if (!trimmed) return "Type the folder the repository goes into.";
  if (trimmed === "~" || trimmed.startsWith("~/") || trimmed.startsWith("/")) return null;
  return "Start the folder with / or ~/ (it is a folder on the Mac).";
}

/** The folder step for a repository named by `owner/name`, as New workspace's clone opens the sheet. */
export function prefilledStep(fullName: string): GithubStep | null {
  const [organisation, name, ...rest] = fullName.split("/");
  if (!organisation || !name || rest.length > 0) return null;
  return {
    kind: "folder",
    organisation,
    team: ALL_TEAMS,
    repository: { name, fullName, description: null, isPrivate: true, permission: null },
  };
}

/** One step back; null from the first step (the sheet closes). An organisation opened on its own repositories goes back to the organisations. */
export function previousStep(
  step: GithubStep,
  answer: GithubAccessAnswer | null = null,
): GithubStep | null {
  switch (step.kind) {
    case "organisations":
      return null;
    case "teams":
      return { kind: "organisations" };
    case "repositories":
      return browsesOrganisation(answer, step.organisation)
        ? { kind: "organisations" }
        : { kind: "teams", organisation: step.organisation };
    case "folder":
      return { kind: "repositories", organisation: step.organisation, team: step.team };
    default: {
      const exhaustive: never = step;
      return exhaustive;
    }
  }
}

/** The sheet's title on each step: the organisation, its team, or the repository chosen. */
export function stepTitle(
  step: GithubStep,
  firstTitle: string,
  allTeams: string,
  answer: GithubAccessAnswer | null = null,
): string {
  switch (step.kind) {
    case "organisations":
      return firstTitle;
    case "teams":
      return step.organisation;
    case "repositories":
      if (browsesOrganisation(answer, step.organisation)) return step.organisation;
      return `${step.organisation} · ${step.team === ALL_TEAMS ? allTeams : step.team}`;
    case "folder":
      return step.repository.fullName;
    default: {
      const exhaustive: never = step;
      return exhaustive;
    }
  }
}

/** A repository row's second line: who can see it, what the team may do, what it is for. */
export function repositoryHint(repository: GithubRepository): string {
  return [
    repository.isPrivate ? "private" : "public",
    repository.permission,
    repository.description,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** An organisation row's second line: its teams when the person is in it, else that they are not. */
export function organisationHint(organisation: GithubOrganisation, notMember: string): string {
  const purpose = organisation.purpose ? ` · ${organisation.purpose}` : "";
  if (organisation.membership !== "member") return `${notMember}${purpose}`;
  const count = organisation.teams.length;
  return `${count} ${count === 1 ? "team" : "teams"}${purpose}`;
}

/** A team row's second line: its repositories, or that GitHub would not say. */
export function teamHint(team: GithubTeam, unread: string): string {
  if (team.repositories === null) return unread;
  const count = team.repositories.length;
  const description = team.description ? ` · ${team.description}` : "";
  return `${count} ${count === 1 ? "repository" : "repositories"}${description}`;
}
