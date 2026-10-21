// Added for Groupon Desk (fork of Paseo, Apache-2.0): what the work window's environment badge says, and where the shell's badge goes.

/**
 * The environment badge of the work window. The web build's shell (`apps/frontend-desk-ts` in the
 * Groupon monorepo) mounts the monorepo's floating badge (`@groupon2/frontend-environment-badge`,
 * class `grpn-env-badge`, bottom-right) and on `desk.grpn.site` it sat over the composer's
 * controls at desktop and phone width (visual pass 2026-10-21, defect 4). The window takes it
 * over: it hides the floating one and draws its own in the sidebar (the footer on a wide window,
 * the header on a phone), never over the composer.
 *
 * Responsibilities:
 * - `environmentBadge`: nothing in a release build that offers no choice of Core (it signs in to
 *   production alone, so a STAGING label would be wrong); in a build that offers one, the Core
 *   chosen when it is not production, with Open PROD on the web
 * - `SHELL_BADGE_HIDE_CSS`, `hideShellEnvironmentBadge`: the floating badge hidden on the web
 *
 * Constraints:
 * - Pure apart from `hideShellEnvironmentBadge`, which only adds one `<style>` element, once
 */

import { GROUPON_DESK_WEB_URL, type GrouponEnvironmentId } from "./environments";

export type EnvironmentBadgeLabel = "STAGING" | "LOCAL";

export interface EnvironmentBadge {
  label: EnvironmentBadgeLabel;
  /** The same page on the production web build; null off the web or already there. */
  openProdUrl: string | null;
}

const LABELS: Readonly<Record<GrouponEnvironmentId, EnvironmentBadgeLabel | null>> = {
  production: null,
  staging: "STAGING",
  local: "LOCAL",
};

/** The page's path, query and hash on the production web build; null when it is not a page or already there. */
export function productionPageUrl(pageHref: string | null): string | null {
  if (!pageHref) return null;
  let page: URL;
  try {
    page = new URL(pageHref);
  } catch {
    return null;
  }
  const production = new URL(GROUPON_DESK_WEB_URL.production);
  if (page.origin === production.origin) return null;
  return `${production.origin}${page.pathname}${page.search}${page.hash}`;
}

export function environmentBadge(input: {
  choiceOffered: boolean;
  environmentId: GrouponEnvironmentId;
  /** `window.location.href` on the web, null in the desktop and phone apps. */
  pageHref: string | null;
}): EnvironmentBadge | null {
  if (!input.choiceOffered) return null;
  const label = LABELS[input.environmentId];
  if (!label) return null;
  return { label, openProdUrl: productionPageUrl(input.pageHref) };
}

/** The shell's floating badge, hidden: the window draws its own in the sidebar, or none. */
export const SHELL_BADGE_STYLE_ID = "groupon-desk-shell-badge";
export const SHELL_BADGE_HIDE_CSS = "#groupon-shell .grpn-env-badge { display: none !important; }";

/** Adds the hiding rule to the page once; a no-op without a document. */
export function hideShellEnvironmentBadge(doc: Document | undefined): void {
  if (!doc?.head || doc.getElementById(SHELL_BADGE_STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = SHELL_BADGE_STYLE_ID;
  style.textContent = SHELL_BADGE_HIDE_CSS;
  doc.head.append(style);
}
