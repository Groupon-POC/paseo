// Added for Groupon Desk (fork of Paseo, Apache-2.0): where Groupon's Core answers, per environment.

/**
 * The three Cores the work window knows; a release build signs in to production alone
 * (`environmentChoiceOffered`), so its gate names no choice. The hosted addresses are the estate
 * table's (`config/estate/src/estate.constants.ts` in the Groupon monorepo: `ESTATE_BACKENDS.core`); the
 * local one is Core's `localPort` 4000, and a worktree's Core (4100, 4200, ...) is typed over it.
 */
export type GrouponEnvironmentId = "production" | "staging" | "local";

export interface GrouponEnvironment {
  id: GrouponEnvironmentId;
  label: string;
  coreUrl: string;
}

export const GROUPON_ENVIRONMENTS: readonly GrouponEnvironment[] = [
  { id: "production", label: "Production", coreUrl: "https://api-core.livingsocial.com" },
  { id: "staging", label: "Staging", coreUrl: "https://api-staging-core.livingsocial.com" },
  { id: "local", label: "Local", coreUrl: "http://localhost:4000" },
];

/**
 * The work window's web build, per environment: what a phone opens to reach the person's Macs
 * through Core once signed in with the same Google account (the settings section Your phone).
 * Local is Expo's web server (`npx expo start --web`, port 8082 beside the desktop's 8081).
 */
export const GROUPON_DESK_WEB_URL: Readonly<Record<GrouponEnvironmentId, string>> = {
  production: "https://desk.livingsocial.com",
  staging: "https://desk.grpn.site",
  local: "http://localhost:8082",
};

/**
 * Groupon Desk for Mac, the menu-bar app whose hand puts a Mac on the hub: the disk image on the
 * one shelf every environment downloads from (the Atlas CLI shelf on staging's internal plane).
 * The Your Macs screen links it only while the hub knows no Mac of the person at all.
 */
export const GROUPON_DESK_DOWNLOAD_URL =
  "https://api-staging-internal.livingsocial.com/atlas/cli/groupon-desk.dmg";

/**
 * Where a person reports a problem with Groupon Desk: the program's feedback board in Asana, the
 * same board `groupon feedback` files to. The Help menu's "Report a problem" opens it, in place of
 * Paseo's Discord and GitHub issues.
 */
export const GROUPON_DESK_FEEDBACK_URL = "https://app.asana.com/0/1203479912683340/";

/**
 * The Core a fresh install signs in to: production for every release build (the web build on a
 * phone is the whole product there), the local Core only for a development bundle.
 */
export function defaultEnvironmentId(isDevelopment: boolean): GrouponEnvironmentId {
  return isDevelopment ? "local" : "production";
}

export function environmentById(id: GrouponEnvironmentId): GrouponEnvironment {
  return GROUPON_ENVIRONMENTS.find((env) => env.id === id) ?? GROUPON_ENVIRONMENTS[0];
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * A Core address as typed, normalised to `scheme://host[:port]`; null when it is not one. Only
 * loopback may use plain http, the same rule the `groupon` CLI keeps.
 */
export function normaliseCoreUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol === "https:") return url.origin;
  if (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)) return url.origin;
  return null;
}

/**
 * Whether the sign-in gate offers a choice of Core at all. A release build signs in to production
 * and nothing else (the owner's word, 2026-10-20: the choice confused people); a development
 * bundle keeps the three, and a release build made for testing staging sets
 * `EXPO_PUBLIC_GROUPON_ENVIRONMENTS=all` at export time.
 */
export function environmentChoiceOffered(
  isDevelopment: boolean,
  environmentsSetting: string | undefined,
): boolean {
  return isDevelopment || environmentsSetting === "all";
}
