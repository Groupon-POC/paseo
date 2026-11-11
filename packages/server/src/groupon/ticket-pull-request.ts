// Added for Groupon Desk (fork of Paseo, Apache-2.0): Paseo's own Create PR refuses a repository on the ticket standard.

/**
 * A repository whose `.groupon/desk.toml` says `[git] pull_requests = "ticket"` opens its pull
 * requests through `groupon ticket pr` (title `[TICKET-KEY] Text`, from a branch named for the
 * ticket), which the Groupon plugin runs for the window's Create PR (`groupon.pull-request`).
 * Paseo's own create (`checkout_pr_create_request`: a title an agent writes from the diff, then
 * `gh pr create`) opened PR 515 of groupon2/engineering-development on 2026-11-11 from a branch
 * with no ticket and a title with no key; so in such a repository it refuses every branch but the
 * standard's exempt ones (`baseline-sync/*`, `release/*`), whoever calls it (an older window, the
 * CLI, an agent).
 *
 * Constraints:
 * - The opt-in and the exempt prefixes are the plugin's (`shared/pull-request.ts`): change both
 * - A repository without the key, or without the file, keeps Paseo's create as it is
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";

const DESK_TOML = join(".groupon", "desk.toml");

/** The `[git] pull_requests` value that puts a repository on the ticket standard. */
export const TICKET_STANDARD = "ticket";

/** Branch shapes the standard exempts (`pull-requests.md`): they keep Paseo's own create. */
export const EXEMPT_BRANCH_PREFIXES: readonly string[] = ["baseline-sync/", "release/"];

/** True when the repository's `.groupon/desk.toml` says `[git] pull_requests = "ticket"`. */
export function readDeskTicketStandard(repoRoot: string | null | undefined): boolean {
  if (!repoRoot) return false;
  const path = join(repoRoot, DESK_TOML);
  try {
    if (!existsSync(path)) return false;
    const doc = parseToml(readFileSync(path, "utf8")) as Record<string, unknown>;
    const git = doc.git;
    return (
      typeof git === "object" &&
      git !== null &&
      !Array.isArray(git) &&
      (git as Record<string, unknown>).pull_requests === TICKET_STANDARD
    );
  } catch {
    return false;
  }
}

/** Why Paseo's own create may not open `branch`; null when it may. */
export function paseoCreateRefusal(input: {
  onTicketStandard: boolean;
  branch: string | null;
}): string | null {
  if (!input.onTicketStandard) return null;
  const branch = input.branch ?? "";
  if (EXEMPT_BRANCH_PREFIXES.some((prefix) => branch.startsWith(prefix))) return null;
  return "This repository opens pull requests with groupon ticket pr (title [TICKET-KEY] Text, from a branch named for its ticket): use Create PR in Groupon Desk, which asks for the ticket when the branch has none, or run groupon ticket pr in the checkout.";
}

/** The refusal for a checkout, reading its root and branch through `git` (run in that checkout). */
export async function ticketStandardRefusal(
  git: (args: string[]) => Promise<string>,
): Promise<string | null> {
  let root: string;
  try {
    root = (await git(["rev-parse", "--show-toplevel"])).trim();
  } catch {
    return null;
  }
  const onTicketStandard = readDeskTicketStandard(root);
  if (!onTicketStandard) return null;
  let branch: string | null = null;
  try {
    branch = (await git(["symbolic-ref", "--quiet", "--short", "HEAD"])).trim() || null;
  } catch {
    branch = null;
  }
  return paseoCreateRefusal({ onTicketStandard, branch });
}
