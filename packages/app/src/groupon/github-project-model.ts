// Added for Groupon Desk (fork of Paseo, Apache-2.0): the From GitHub sheet's steps, as plain data.

/**
 * Add a project, From GitHub: the person's organisations (as the platform sees them, through the
 * Groupon plugin on the Mac), then a team, then one of the team's repositories, then the folder it
 * is downloaded into. Pure, so the steps and the lists are tested without a screen.
 */

import type {
  GithubAccessAnswer,
  GithubOrganisation,
  GithubRepository,
  GithubTeam,
} from "./desk-plugin-rpc";

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

/** One step back; null from the first step (the sheet closes). */
export function previousStep(step: GithubStep): GithubStep | null {
  switch (step.kind) {
    case "organisations":
      return null;
    case "teams":
      return { kind: "organisations" };
    case "repositories":
      return { kind: "teams", organisation: step.organisation };
    case "folder":
      return { kind: "repositories", organisation: step.organisation, team: step.team };
    default: {
      const exhaustive: never = step;
      return exhaustive;
    }
  }
}

/** The sheet's title on each step: the organisation, its team, or the repository chosen. */
export function stepTitle(step: GithubStep, firstTitle: string, allTeams: string): string {
  switch (step.kind) {
    case "organisations":
      return firstTitle;
    case "teams":
      return step.organisation;
    case "repositories":
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
