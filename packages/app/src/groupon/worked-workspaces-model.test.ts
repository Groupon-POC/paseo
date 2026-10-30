// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for which chats on a shared checkout show its pull request.

import { describe, expect, it } from "vitest";
import { showsCheckoutPullRequest } from "./worked-workspaces-model";

describe("showsCheckoutPullRequest", () => {
  it("shows a shared checkout's pull request on the chats that worked on the branch only", () => {
    const worked = new Set(["desk"]);

    expect(
      showsCheckoutPullRequest({
        workspaceId: "desk",
        sharedCheckout: true,
        siblingIds: ["tempo"],
        worked,
      }),
    ).toBe(true);
    expect(
      showsCheckoutPullRequest({
        workspaceId: "tempo",
        sharedCheckout: true,
        siblingIds: ["desk"],
        worked,
      }),
    ).toBe(false);
  });

  it("shows it everywhere on a worktree, a checkout of one chat, or while no chat worked on it", () => {
    const none = new Set<string>();

    expect(
      showsCheckoutPullRequest({
        workspaceId: "wt",
        sharedCheckout: false,
        siblingIds: ["x"],
        worked: none,
      }),
    ).toBe(true);
    expect(
      showsCheckoutPullRequest({
        workspaceId: "solo",
        sharedCheckout: true,
        siblingIds: [],
        worked: none,
      }),
    ).toBe(true);
    expect(
      showsCheckoutPullRequest({
        workspaceId: "tempo",
        sharedCheckout: true,
        siblingIds: ["desk"],
        worked: none,
      }),
    ).toBe(true);
  });
});
