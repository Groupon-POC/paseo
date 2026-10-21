// Added for Groupon Desk (fork of Paseo, Apache-2.0): the work window's environment badge.
/**
 * Tests for the environment badge: none in a release build without a choice of Core, the chosen
 * Core otherwise, Open PROD keeping the page, and the shell's floating badge hidden once.
 *
 * Covers: packages/app/src/groupon/environment-badge-model.ts
 */
import { describe, expect, it } from "vitest";
import {
  environmentBadge,
  hideShellEnvironmentBadge,
  productionPageUrl,
  SHELL_BADGE_HIDE_CSS,
  SHELL_BADGE_STYLE_ID,
} from "./environment-badge-model";

describe("the work window's environment badge", () => {
  it("draws nothing in a release build that offers no choice, whatever the page's host (desk.grpn.site, 2026-10-21)", () => {
    for (const environmentId of ["production", "staging", "local"] as const) {
      expect(
        environmentBadge({
          choiceOffered: false,
          environmentId,
          pageHref: "https://desk.grpn.site/h/srv/workspace/w1",
        }),
      ).toBeNull();
    }
  });

  it("names the chosen Core when a build offers the choice and it is not production", () => {
    expect(
      environmentBadge({
        choiceOffered: true,
        environmentId: "production",
        pageHref: null,
      }),
    ).toBeNull();
    expect(
      environmentBadge({
        choiceOffered: true,
        environmentId: "staging",
        pageHref: null,
      }),
    ).toEqual({ label: "STAGING", openProdUrl: null });
    expect(
      environmentBadge({
        choiceOffered: true,
        environmentId: "local",
        pageHref: "http://localhost:8082/settings?tab=groupon#archived",
      }),
    ).toEqual({
      label: "LOCAL",
      openProdUrl: "https://desk.livingsocial.com/settings?tab=groupon#archived",
    });
  });

  it("opens the same page on production, and offers nothing on production itself", () => {
    expect(productionPageUrl("https://desk.grpn.site/h/srv/workspace/w1?x=1#y")).toBe(
      "https://desk.livingsocial.com/h/srv/workspace/w1?x=1#y",
    );
    expect(productionPageUrl("https://desk.livingsocial.com/settings")).toBeNull();
    expect(productionPageUrl("not a url")).toBeNull();
    expect(productionPageUrl(null)).toBeNull();
  });

  it("hides the shell's floating badge with one style element, added once", () => {
    const appended: { id: string; textContent: string }[] = [];
    const doc = {
      head: {
        append: (node: { id: string; textContent: string }) => appended.push(node),
      },
      getElementById: (id: string) => appended.find((node) => node.id === id) ?? null,
      createElement: () => ({ id: "", textContent: "" }),
    } as unknown as Document;
    hideShellEnvironmentBadge(doc);
    hideShellEnvironmentBadge(doc);
    hideShellEnvironmentBadge(undefined);
    expect(appended).toEqual([{ id: SHELL_BADGE_STYLE_ID, textContent: SHELL_BADGE_HIDE_CSS }]);
    expect(SHELL_BADGE_HIDE_CSS).toContain(".grpn-env-badge");
    expect(SHELL_BADGE_HIDE_CSS).toContain("display: none");
  });
});
