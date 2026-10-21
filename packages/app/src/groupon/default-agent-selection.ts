// Added for Groupon Desk (fork of Paseo, Apache-2.0): the agent New workspace starts with, as plain data.

/**
 * The agent a composer preselects when the person has not picked one (owner finding, 2026-10-21:
 * New workspace showed "Select model" until a pick). The order: the agent last used on this device
 * (Paseo's form preferences, the source `improveAgent` reads too) when this Mac can start it, else
 * Claude, else the first agent this Mac can start; its model is the one used last with it, else
 * the agent's own default model.
 * Pure, so the rules are tested without a screen.
 *
 * Responsibilities:
 * - `pickProvider`: the provider among the ones this Mac can start (the last used, else Claude,
 *   else the first), null when there is none
 *
 * Constraints:
 * - Never overrides a pick the person made on the page; callers use it only before any pick
 */

/** The provider to start with among `available` (in the Mac's own order); null when none. */
export function pickProvider(
  available: readonly string[],
  lastUsed: string | null | undefined,
): string | null {
  return (
    available.find((id) => id === lastUsed) ??
    available.find((id) => id.startsWith("claude")) ??
    available[0] ??
    null
  );
}
