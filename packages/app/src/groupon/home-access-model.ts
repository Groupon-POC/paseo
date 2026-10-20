// Added for Groupon Desk (fork of Paseo, Apache-2.0): what the home page's Your access says, as pure functions.

/**
 * The words of the home page's two access cards (`home-access.tsx`): the Encore apps the platform
 * hands out with the person's standing on each, and per GitHub host the organisations and teams
 * the person is in, or the command that signs gh in there. Pure, so the cards' wording and order
 * are tested without rendering them. The Mac they are read on is the one this window runs beside,
 * else the first the person has.
 */

import type {
  EncoreAppsAnswer,
  EncoreCatalogApp,
  GithubAccessAnswer,
  GithubOrganisation,
} from "./desk-plugin-rpc";
import { accessOffer, standingText } from "./encore-state-model";
import { GROUPON_ACCESS } from "./strings";

/** The cards read again this often while the home page is on screen. */
export const ACCESS_REFRESH_MS = 60_000;

/** The GitHub hosts the card shows, in its order. */
export const ACCESS_GITHUB_HOSTS = ["github.com", "github.groupondev.com"] as const;

/** The Mac the cards are read on: the one this window runs beside, else the first one listed. */
export function accessServerIdOf(
  localServerId: string | null,
  hosts: readonly { serverId: string }[],
): string | null {
  if (localServerId && hosts.some((host) => host.serverId === localServerId)) return localServerId;
  return hosts[0]?.serverId ?? localServerId ?? null;
}

/**
 * What the app is called: the catalog's description up to its first full stop or comma
 * ("Core plane. The daily-business backend" is Core plane); the app id when it says nothing.
 */
export function encoreAppTitle(app: Pick<EncoreCatalogApp, "slug" | "description">): string {
  const head = app.description.split(/[.,](?:\s|$)/)[0]?.trim() ?? "";
  return head.length > 0 && head.length <= 40 ? head : app.slug;
}

const STANDING_ORDER: Record<EncoreCatalogApp["standing"], number> = {
  member: 0,
  invited: 1,
  unknown: 2,
  "not-member": 3,
  "not-handed-out": 4,
};

export interface EncoreAccessRow {
  slug: string;
  title: string;
  standing: string;
  /** A member reads as good; anything else is plain, never an error. */
  tone: "good" | "neutral";
  /** "ask": not a member; "ask-unknown": nobody could say; "none": a member, or a request waits. */
  offer: "none" | "ask" | "ask-unknown";
}

/** The apps the person is in first, then the rest, each with its standing in a sentence. */
export function encoreAccessRows(answer: EncoreAppsAnswer): EncoreAccessRow[] {
  return [...answer.apps]
    .sort(
      (a, b) =>
        STANDING_ORDER[a.standing] - STANDING_ORDER[b.standing] || a.slug.localeCompare(b.slug),
    )
    .map((app) => ({
      slug: app.slug,
      title: encoreAppTitle(app),
      standing: standingText(app),
      tone: app.standing === "member" ? "good" : "neutral",
      offer: accessOffer(app),
    }));
}

/** "You are a member of 3 of 3 apps"; null with no app to count. */
export function encoreCountText(answer: EncoreAppsAnswer): string | null {
  if (answer.apps.length === 0) return null;
  const members = answer.apps.filter((app) => app.standing === "member").length;
  return GROUPON_ACCESS.encoreCount(members, answer.apps.length);
}

export interface GithubOrganisationRow {
  login: string;
  /** "Platform · team-a, team-b", "not in it yet", ... */
  detail: string;
  member: boolean;
}

export type GithubHostCard =
  | { kind: "signed-out"; host: string; signIn: string }
  | { kind: "problem"; host: string; problem: string }
  | {
      kind: "access";
      host: string;
      login: string | null;
      organisations: GithubOrganisationRow[];
      /** How many other organisations on the host the person may clone from; null on github.com. */
      others: number | null;
      /** Where access is asked for (the admin's onboarding page); null where the platform has none. */
      askUrl: string | null;
    };

function organisationDetail(organisation: GithubOrganisation): string {
  if (organisation.membership === "not_member") return GROUPON_ACCESS.notMember;
  if (organisation.membership !== "member") return GROUPON_ACCESS.membershipUnknown;
  const teams = organisation.teams.map((team) => team.name);
  return teams.length > 0 ? teams.join(", ") : GROUPON_ACCESS.noTeam;
}

/** One host's card: the command that signs gh in, the reason nothing could be read, or the organisations (yours first, else in the platform's order). */
export function githubHostCard(host: string, answer: GithubAccessAnswer): GithubHostCard {
  const entry = answer.hosts?.find((row) => row.host === host);
  if (entry && entry.login === null && entry.signIn) {
    return { kind: "signed-out", host, signIn: entry.signIn };
  }
  if (!answer.access) {
    return { kind: "problem", host, problem: answer.problem ?? GROUPON_ACCESS.noOrganisation };
  }
  const organisations = answer.access.organisations
    .map((organisation) => ({
      login: organisation.login,
      detail: organisationDetail(organisation),
      member: organisation.membership === "member",
    }))
    // Stable: the platform's own order among yours, and among the rest.
    .sort((a, b) => Number(b.member) - Number(a.member));
  return {
    kind: "access",
    host,
    login: answer.access.githubLogin ?? entry?.login ?? null,
    organisations,
    others: answer.access.otherOrganisations?.length ?? null,
    askUrl: answer.access.requestAccessUrl,
  };
}

/** github.com as it is; the enterprise by name, with its host. */
export function githubHostTitle(host: string): string {
  return host === "github.com" ? "github.com" : `${GROUPON_ACCESS.enterprise} (${host})`;
}
