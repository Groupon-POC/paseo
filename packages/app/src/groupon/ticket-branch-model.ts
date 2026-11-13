// Added for Groupon Desk (fork of Paseo, Apache-2.0): New workspace names a ticket repository's branch from a Jira ticket, as plain data.

/**
 * A repository whose `.groupon/desk.toml` is on its default branch or in the checkout names every
 * branch from a Jira ticket (the company's branch standard, `groupon ticket name`). On New
 * workspace its ticket step sits above the composer and is OPTIONAL: the person picks one of My
 * tasks or types a key, the page shows the branch the helper answers, and the workspace is created
 * on that branch. The composer's text stays the task's first message and names the workspace,
 * never the branch.
 *
 * The owner ruled on 2026-11-13 that a ticket is never a condition: the person may tell the agent
 * which ticket, and where, during the conversation. So Create is never refused for want of one;
 * without a ticket the workspace is Paseo's own (its naming, the fork's rename after the first
 * message).
 *
 * - A worktree that branches off, and Local, take a ticket when one is given (a ticket's work is a
 *   worktree on its branch); without one the creation is as chosen.
 * - A pull request's checkout and an existing branch's checkout keep their own branch: no ticket
 *   step.
 *
 * Pure, so the rule is tested without a screen.
 */

import type { TicketNameAnswer } from "./desk-plugin-rpc";

/** What New workspace asks of the ticket for the chosen repository and way of working. */
export type TicketRule = "none" | "optional";

/** The ticket step's state: nothing picked, the helper asked, its branch, or its reason. */
export type TicketBranch =
  | { status: "empty" }
  | { status: "naming"; ticket: string }
  | { status: "named"; ticket: string; branch: string }
  | { status: "refused"; ticket: string; reason: string };

/** The parts of the base picker's checkout request this rule reads (`PickerCheckoutRequest`). */
export interface CheckoutLike {
  action?: "branch-off" | "checkout";
  refName?: string;
  checkoutSource?: unknown;
  githubPrNumber?: number;
}

/** True when the repository file was found (the default branch or the checkout); false while unread. */
export function namesBranchesFromTicket(answer: { source: string } | undefined): boolean {
  return answer !== undefined && answer.source !== "none";
}

function checksOutExisting(checkout: CheckoutLike | undefined): boolean {
  return (
    checkout?.action === "checkout" ||
    checkout?.checkoutSource !== undefined ||
    checkout?.githubPrNumber !== undefined
  );
}

export function ticketRuleOf(input: {
  namesFromTicket: boolean;
  createsWorktree: boolean;
  checkout: CheckoutLike | undefined;
}): TicketRule {
  if (!input.namesFromTicket) return "none";
  if (!input.createsWorktree) return "optional";
  return checksOutExisting(input.checkout) ? "none" : "optional";
}

/** The step after the helper answered for `asked`; an answer for a key no longer in the field is dropped. */
export function ticketBranchAfter(
  current: TicketBranch,
  asked: string,
  answer: TicketNameAnswer,
): TicketBranch {
  if (current.status !== "naming" || current.ticket !== asked) return current;
  return answer.kind === "named"
    ? { status: "named", ticket: answer.ticket, branch: answer.branch }
    : { status: "refused", ticket: asked, reason: answer.reason };
}

/** How the workspace is created: Paseo's own request, or a worktree branching off onto the ticket's branch. */
export type TicketCreation =
  | { kind: "as-chosen" }
  | {
      kind: "ticket-branch";
      checkout: { action: "branch-off"; refName?: string; branchName: string };
    };

/**
 * The creation for the rule and the step; never throws: with no branch named it is as chosen. The
 * base the person picked stays the new branch's base.
 */
export function ticketCreationOf(input: {
  rule: TicketRule;
  step: TicketBranch;
  checkout: CheckoutLike | undefined;
}): TicketCreation {
  const { rule, step, checkout } = input;
  if (rule === "none") return { kind: "as-chosen" };
  if (step.status === "named") {
    const base = checkout?.action === "branch-off" ? checkout.refName?.trim() : undefined;
    return {
      kind: "ticket-branch",
      checkout: {
        action: "branch-off",
        ...(base ? { refName: base } : {}),
        branchName: step.branch,
      },
    };
  }
  return { kind: "as-chosen" };
}
