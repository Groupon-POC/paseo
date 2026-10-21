// Added for Groupon Desk (fork of Paseo, Apache-2.0): the folder browser's rules, a person clicks through folders instead of typing a path.

/**
 * The owner's word of 2026-10-21: "here I cannot even browse folders normally like a person, I
 * have to type like a robot". Choose parent directory, Search for directory and From GitHub's
 * clone destination browse the chosen Mac's folders one at a time, asked of that Mac's daemon
 * (`groupon-desk.list-directory`, so a remote Mac answers through the relay too).
 *
 * Responsibilities:
 * - Read the daemon's answer (`parseFolderListing`) and ask for one folder (`readFolder`).
 * - Turn the field and the folder being looked at into what to list, how to filter it and what
 *   "Choose this folder" picks (`browserTarget`).
 * - The rows: the usual places first at the home folder, then the subfolders alphabetically,
 *   hidden ones folded behind one row (`browserRows`, `browserPlaces`).
 * - The breadcrumb from the home folder down (`breadcrumbs`).
 *
 * Constraints:
 * - The home folder is the top: no crumb and no place above it (the daemon refuses anything
 *   outside home anyway).
 * - Pure: no React, no daemon, so every rule here is tested.
 */

import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";

export const GROUPON_DESK_RPC_PLUGIN_ID = "groupon-desk";
export const LIST_DIRECTORY_METHOD = "groupon-desk.list-directory";

export interface FolderEntry {
  name: string;
  path: string;
  hidden: boolean;
  gitCheckout: boolean;
}

export interface FolderListing {
  path: string;
  homePath: string;
  parentPath: string | null;
  entries: FolderEntry[];
  places: string[];
  truncated: boolean;
  error: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFolderEntry(value: unknown): value is FolderEntry {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.path === "string" &&
    typeof value.hidden === "boolean" &&
    typeof value.gitCheckout === "boolean"
  );
}

/** The daemon's answer; throws on any other shape (a daemon older than the browser answers with an error). */
export function parseFolderListing(output: unknown): FolderListing {
  if (
    !isRecord(output) ||
    typeof output.path !== "string" ||
    typeof output.homePath !== "string" ||
    !Array.isArray(output.entries)
  ) {
    throw new Error("This Mac's daemon cannot list folders yet: update Groupon Desk there.");
  }
  return {
    path: output.path,
    homePath: output.homePath,
    parentPath: typeof output.parentPath === "string" ? output.parentPath : null,
    entries: output.entries.filter(isFolderEntry),
    places: Array.isArray(output.places)
      ? output.places.filter((place): place is string => typeof place === "string")
      : [],
    truncated: output.truncated === true,
    error: typeof output.error === "string" ? output.error : null,
  };
}

export async function readFolder(
  client: Pick<DaemonClient, "invokePluginRpc">,
  path: string,
): Promise<FolderListing> {
  return parseFolderListing(
    await client.invokePluginRpc(GROUPON_DESK_RPC_PLUGIN_ID, LIST_DIRECTORY_METHOD, { path }),
  );
}

function trimTrailingSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") || "/" : path;
}

function isInside(root: string, path: string): boolean {
  const base = trimTrailingSlash(root);
  return path === base || path.startsWith(base === "/" ? "/" : `${base}/`);
}

/** `/Users/x/Documents` → `~/Documents` against that Mac's home, never this device's. */
export function displayPath(path: string, homePath: string): string {
  const home = trimTrailingSlash(homePath);
  if (path === home) return "~";
  return isInside(home, path) ? `~${path.slice(home.length)}` : path;
}

/** `~/Documents` → `/Users/x/Documents` against that Mac's home. */
export function absolutePath(path: string, homePath: string): string {
  if (path === "~") return trimTrailingSlash(homePath);
  if (path.startsWith("~/")) return `${trimTrailingSlash(homePath)}${path.slice(1)}`;
  return path;
}

/** The field holds a path (`/…` or `~…`) rather than a word to filter by. */
export function isTypedPath(query: string): boolean {
  const trimmed = query.trim();
  return trimmed.startsWith("/") || trimmed === "~" || trimmed.startsWith("~/");
}

export interface BrowserTarget {
  /** The folder to ask the daemon for. */
  listPath: string;
  /** What narrows that folder's subfolders (by name, case ignored). */
  filter: string;
  /** What Choose this folder picks: the folder looked at, or the path typed. */
  chosenPath: string;
}

/**
 * A word filters the folder being looked at. A typed path lists its parent filtered by its last
 * part (`~/Doc` lists `~` narrowed to "Doc"), or the folder itself once it ends in a slash; Choose
 * then picks the path typed.
 */
export function browserTarget(folder: string, query: string): BrowserTarget {
  const typed = query.trim();
  if (!isTypedPath(typed)) return { listPath: folder, filter: typed, chosenPath: folder };
  if (typed === "~" || typed.endsWith("/")) {
    const listPath = trimTrailingSlash(typed);
    return { listPath, filter: "", chosenPath: listPath };
  }
  const cut = typed.lastIndexOf("/");
  const parent = cut <= 0 ? "/" : typed.slice(0, cut);
  return { listPath: parent, filter: typed.slice(cut + 1), chosenPath: typed };
}

export interface Crumb {
  label: string;
  path: string;
}

export const HOME_CRUMB_LABEL = "Home";

/** Home, then each folder down to `path`; a path outside home starts at `/`. */
export function breadcrumbs(path: string, homePath: string): Crumb[] {
  const home = trimTrailingSlash(homePath);
  const target = trimTrailingSlash(path);
  const inHome = isInside(home, target);
  const crumbs: Crumb[] = inHome
    ? [{ label: HOME_CRUMB_LABEL, path: home }]
    : [{ label: "/", path: "/" }];
  const rest = inHome ? target.slice(home.length) : target;
  let at = inHome ? home : "";
  for (const part of rest.split("/").filter(Boolean)) {
    at = `${at}/${part}`;
    crumbs.push({ label: part, path: at });
  }
  return crumbs;
}

function parentOf(path: string): string | null {
  const trimmed = trimTrailingSlash(path);
  const cut = trimmed.lastIndexOf("/");
  if (cut < 0) return null;
  return cut === 0 ? "/" : trimmed.slice(0, cut);
}

function byDisplay(homePath: string) {
  return (a: string, b: string) =>
    displayPath(a, homePath).localeCompare(displayPath(b, homePath), undefined, {
      numeric: true,
      sensitivity: "base",
    });
}

/**
 * The places offered at the home folder: the usual ones that exist on that Mac (the daemon names
 * them, nearest first), then every folder that holds a checkout the window knows of on that Mac
 * (its projects and the hub's checkouts), alphabetically; inside home only, home itself left out.
 */
export function browserPlaces(input: {
  homePath: string;
  usual: readonly string[];
  checkoutPaths: readonly string[];
}): string[] {
  const home = trimTrailingSlash(input.homePath);
  const seen = new Set<string>([home]);
  const keep = (path: string): boolean => {
    if (seen.has(path) || !isInside(home, path)) return false;
    seen.add(path);
    return true;
  };
  const usual = input.usual.map(trimTrailingSlash).filter(keep);
  const holders = input.checkoutPaths
    .map((path) => parentOf(absolutePath(trimTrailingSlash(path), home)))
    .filter((path): path is string => path !== null)
    .filter(keep)
    .sort(byDisplay(home));
  return [...usual, ...holders];
}

export type BrowserRow =
  | { kind: "place"; path: string; label: string }
  | { kind: "folder"; entry: FolderEntry }
  | { kind: "hidden"; count: number; shown: boolean };

function matchRank(name: string, filter: string): number | null {
  if (!filter) return 0;
  const lower = name.toLowerCase();
  if (lower.startsWith(filter)) return 0;
  return lower.includes(filter) ? 1 : null;
}

/**
 * The rows under the breadcrumb: at the home folder the places first, then the folder's
 * subfolders alphabetically (those whose name starts with the filter before those that only
 * contain it), hidden ones (dot folders, macOS's Library) folded behind one last row unless shown
 * or the filter itself starts with a dot.
 */
export function browserRows(input: {
  listing: FolderListing | null;
  places: readonly string[];
  filter: string;
  showHidden: boolean;
}): BrowserRow[] {
  const listing = input.listing;
  if (!listing || listing.error) return [];
  const filter = input.filter.trim().toLowerCase();
  const atHome = trimTrailingSlash(listing.path) === trimTrailingSlash(listing.homePath);
  const places: BrowserRow[] = atHome
    ? input.places
        .map(
          (path): BrowserRow => ({
            kind: "place",
            path,
            label: displayPath(path, listing.homePath),
          }),
        )
        .filter(
          (place) =>
            place.kind !== "place" || !filter || place.label.toLowerCase().includes(filter),
        )
    : [];

  const matching = listing.entries
    .map((entry) => ({ entry, rank: matchRank(entry.name, filter) }))
    .filter((match): match is { entry: FolderEntry; rank: number } => match.rank !== null);
  const revealHidden = input.showHidden || filter.startsWith(".");
  const visible = matching.filter((match) => revealHidden || !match.entry.hidden);
  // Entries come sorted by name; a stable sort by rank keeps that order inside each rank.
  const folders: BrowserRow[] = [...visible]
    .sort((a, b) => a.rank - b.rank)
    .map((match) => ({ kind: "folder", entry: match.entry }));
  const hiddenCount = matching.filter((match) => match.entry.hidden).length;
  const toggle: BrowserRow[] =
    hiddenCount > 0 && !filter.startsWith(".")
      ? [{ kind: "hidden", count: hiddenCount, shown: input.showHidden }]
      : [];
  return [...places, ...folders, ...toggle];
}

export function hiddenToggleLabel(row: { count: number; shown: boolean }): string {
  if (row.shown) return "Hide hidden folders";
  return row.count === 1 ? "Show 1 hidden folder" : `Show ${row.count} hidden folders`;
}
