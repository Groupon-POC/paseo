// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for New workspace's ticket rule.

import { describe, expect, it } from "vitest";
import {
  namesBranchesFromTicket,
  ticketBranchAfter,
  ticketCreationOf,
  ticketRuleOf,
} from "./ticket-branch-model";

const BRANCH = "b2b/QR-1742/ENC-1234-partner-feed-service";
const BASE = { action: "branch-off" as const, refName: "origin/staging" };

describe("which repositories name branches from a ticket", () => {
  it.each([
    [{ source: "default-branch" }, true],
    [{ source: "checkout" }, true],
    [{ source: "none" }, false],
    [undefined, false],
  ])("reads %j as %s", (answer, expected) => {
    expect(namesBranchesFromTicket(answer)).toBe(expected);
  });
});

describe("the ticket rule", () => {
  it("offers a ticket, never requires one, for a worktree that branches off in a ticket repository", () => {
    expect(ticketRuleOf({ namesFromTicket: true, createsWorktree: true, checkout: BASE })).toBe(
      "optional",
    );
  });

  it("asks nothing of a pull request's checkout or of a repository without the file", () => {
    const pr = { action: "checkout" as const, refName: "x", githubPrNumber: 7 };
    expect(ticketRuleOf({ namesFromTicket: true, createsWorktree: true, checkout: pr })).toBe(
      "none",
    );
    expect(ticketRuleOf({ namesFromTicket: false, createsWorktree: true, checkout: BASE })).toBe(
      "none",
    );
  });

  it("offers a ticket for Local too", () => {
    expect(
      ticketRuleOf({ namesFromTicket: true, createsWorktree: false, checkout: undefined }),
    ).toBe("optional");
  });
});

describe("the ticket step", () => {
  it("shows the helper's branch for the key it was asked about", () => {
    const step = ticketBranchAfter({ status: "naming", ticket: "ENC-1234" }, "ENC-1234", {
      kind: "named",
      ticket: "ENC-1234",
      branch: BRANCH,
    });
    expect(step).toEqual({ status: "named", ticket: "ENC-1234", branch: BRANCH });
  });

  it("shows the helper's reason when it gives no name", () => {
    const step = ticketBranchAfter({ status: "naming", ticket: "ENC-1" }, "ENC-1", {
      kind: "refused",
      reason: "ENC-1 has no parent",
    });
    expect(step).toEqual({ status: "refused", ticket: "ENC-1", reason: "ENC-1 has no parent" });
  });

  it("drops an answer for a key the person has since replaced", () => {
    const current = { status: "naming" as const, ticket: "ENC-2" };
    expect(
      ticketBranchAfter(current, "ENC-1", { kind: "named", ticket: "ENC-1", branch: BRANCH }),
    ).toBe(current);
  });
});

describe("the creation", () => {
  it("branches off the picked base onto the ticket's branch", () => {
    const creation = ticketCreationOf({
      rule: "optional",
      step: { status: "named", ticket: "ENC-1234", branch: BRANCH },
      checkout: BASE,
    });
    expect(creation).toEqual({
      kind: "ticket-branch",
      checkout: { action: "branch-off", refName: "origin/staging", branchName: BRANCH },
    });
  });

  it.each([
    { status: "empty" as const },
    { status: "naming" as const, ticket: "ENC-1234" },
    { status: "refused" as const, ticket: "ENC-1234", reason: "no parent" },
  ])("creates as chosen, never throws, when no branch is named ($status)", (step) => {
    expect(ticketCreationOf({ rule: "optional", step, checkout: BASE })).toEqual({
      kind: "as-chosen",
    });
  });

  it("makes Local with a ticket a worktree on the ticket's branch, from the default branch", () => {
    const creation = ticketCreationOf({
      rule: "optional",
      step: { status: "named", ticket: "ENC-1234", branch: BRANCH },
      checkout: undefined,
    });
    expect(creation).toEqual({
      kind: "ticket-branch",
      checkout: { action: "branch-off", branchName: BRANCH },
    });
  });

  it("leaves Local without a ticket, and a repository with no rule, as chosen", () => {
    expect(
      ticketCreationOf({ rule: "optional", step: { status: "empty" }, checkout: undefined }),
    ).toEqual({ kind: "as-chosen" });
    expect(ticketCreationOf({ rule: "none", step: { status: "empty" }, checkout: BASE })).toEqual({
      kind: "as-chosen",
    });
  });
});
