// Added for Groupon Desk (fork of Paseo, Apache-2.0): Create PR on the company's pull-request standard.

/**
 * The window's Create PR in a repository whose `.groupon/desk.toml` says `[git] pull_requests =
 * "ticket"`: the Groupon plugin on the workspace's Mac opens it with `groupon ticket pr` (title
 * `[TICKET-KEY] Text`), and a branch that carries no ticket stops before any pull request while the
 * person gives one (`ticket-pull-request-sheet.tsx`). Elsewhere, and on the exempt branches
 * (`baseline-sync/*`, `release/*`), Paseo's own create runs as before.
 *
 * Responsibilities:
 * - `createPrRoute`: which way Create PR goes for a checkout, Paseo's own when the Mac's plugin
 *   is missing or older (the daemon then refuses a repository on the standard itself)
 * - `useTicketPullRequestStore`: the sheet's request, opened by the button, closed by the sheet
 * - `openedProblem`: an `open: true` answer as the sentence to show, null when it opened
 *
 * Constraints:
 * - Nothing here creates a Jira ticket: the person types or picks a key, or creates the ticket in
 *   Jira themselves (`JIRA_CREATE_URL`)
 */

import { create } from "zustand";
import {
  type PluginRpcClient,
  type PullRequestOutcome,
  pluginProblemText,
  pullRequestOnStandard,
} from "./desk-plugin-rpc";
import { GROUPON_PULL_REQUEST } from "./strings";

/** The person's open tickets, newest activity first: My tasks for this sheet. */
export const MY_OPEN_TICKETS_JQL =
  "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC";

/** Jira's own Create screen: a ticket is the person's to create, never the window's. */
export const JIRA_CREATE_URL = "https://groupondev.atlassian.net/secure/CreateIssue!default.jspa";

function pluginMissing(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.startsWith("Plugin is not available") || /does not contribute RPC/.test(message);
}

/** Which way Create PR goes for the checkout at `cwd` (`open: false`: nothing is changed). */
export async function createPrRoute(
  client: PluginRpcClient,
  cwd: string,
): Promise<PullRequestOutcome> {
  try {
    return await pullRequestOnStandard(client, { cwd, open: false });
  } catch (error) {
    if (pluginMissing(error)) return { kind: "paseo", branch: null };
    throw new Error(pluginProblemText(error), { cause: error });
  }
}

/** What to tell the person about an `open: true` answer; null when the pull request is open. */
export function openedProblem(outcome: PullRequestOutcome): string | null {
  switch (outcome.kind) {
    case "opened":
      return null;
    case "refused":
      return outcome.reason;
    case "needs-ticket":
      return GROUPON_PULL_REQUEST.stillNoTicket(outcome.branch);
    case "paseo":
    case "ready":
      return GROUPON_PULL_REQUEST.notOpened;
    default: {
      const _exhaustive: never = outcome;
      return String(_exhaustive);
    }
  }
}

/** The sheet's request: the checkout whose branch carries no ticket. */
export interface TicketPullRequestRequest {
  id: number;
  serverId: string;
  cwd: string;
  branch: string;
  /** A key the branch name mentions, offered to the person, never taken without them. */
  suggested: string | null;
}

interface TicketPullRequestState {
  request: TicketPullRequestRequest | null;
  open: (input: Omit<TicketPullRequestRequest, "id">) => void;
  close: () => void;
}

let nextRequestId = 1;

export const useTicketPullRequestStore = create<TicketPullRequestState>((set) => ({
  request: null,
  open: (input) => set({ request: { id: nextRequestId++, ...input } }),
  close: () => set({ request: null }),
}));
