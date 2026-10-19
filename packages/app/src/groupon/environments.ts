// Added for Groupon Desk (fork of Paseo, Apache-2.0): where Groupon's Core answers, per environment.

/**
 * The three Cores a person can sign in to. The hosted addresses are the estate table's
 * (`config/estate/src/estate.constants.ts` in the Groupon monorepo: `ESTATE_BACKENDS.core`); the
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
