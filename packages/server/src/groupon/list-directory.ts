// Added for Groupon Desk (fork of Paseo, Apache-2.0): one folder's subfolders, for the window's folder browser.

/**
 * The window's folder browser (Choose parent directory, Search for directory, From GitHub's
 * clone destination) asks the Mac's daemon for one folder at a time, so a person clicks through
 * folders instead of typing a path (owner, 2026-10-21). Answered by the daemon itself as the
 * built-in RPC `groupon-desk.list-directory`, so it works the same for a remote Mac through the
 * relay.
 *
 * Responsibilities:
 * - List a folder's subfolders (never files), each with a hidden flag and a git-checkout flag.
 * - Name the usual places under the home folder that exist on this Mac.
 *
 * Constraints:
 * - Never lists a folder outside the daemon user's home: the folder's real path (symlinks
 *   resolved) must sit inside the home's real path.
 * - Never reads under `~/Library` on macOS: readdir there can block forever on a TCC prompt the
 *   daemon cannot show (the same reason Paseo's directory search skips it).
 * - Answers a problem as data (`error`), never a throw, so the window can say it in one line.
 */

import { constants } from "node:fs";
import { access, readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { isPathInsideRoot } from "../utils/path.js";

export const LIST_DIRECTORY_METHOD = "groupon-desk.list-directory";

/** The most subfolders one answer carries; a bigger folder answers `truncated`. */
export const LIST_DIRECTORY_LIMIT = 2_000;

/** The places a person usually keeps work in, nearest first, shown when they exist. */
export const USUAL_PLACES = ["Documents/GitHub", "Developer", "Desktop", "Documents"] as const;

export interface DirectoryEntry {
  name: string;
  path: string;
  /** A dot folder, or `~/Library` on macOS: folded away until asked for. */
  hidden: boolean;
  /** The folder holds `.git` (a checkout or a worktree). */
  gitCheckout: boolean;
}

export interface DirectoryListing {
  /** The folder listed, absolute; the home folder when the request named none. */
  path: string;
  /** The daemon user's home folder: the top of the browser, never left. */
  homePath: string;
  /** The folder above, or null at the home folder. */
  parentPath: string | null;
  entries: DirectoryEntry[];
  /** The usual places that exist on this Mac, absolute. */
  places: string[];
  truncated: boolean;
  error: string | null;
}

export interface ListDirectoryInput {
  path?: unknown;
}

export interface ListDirectoryOptions {
  homePath?: string;
  platform?: NodeJS.Platform;
}

export const LIST_DIRECTORY_ERRORS = {
  outsideHome: "Only folders inside the home folder can be browsed.",
  notFound: "That folder does not exist.",
  notDirectory: "That is a file, not a folder.",
  library: "Folders inside Library cannot be browsed here.",
  unreadable: "That folder cannot be read.",
} as const;

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function byName(a: DirectoryEntry, b: DirectoryEntry): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

function emptyListing(path: string, homePath: string, error: string): DirectoryListing {
  return { path, homePath, parentPath: null, entries: [], places: [], truncated: false, error };
}

async function usualPlaces(homePath: string): Promise<string[]> {
  const candidates = USUAL_PLACES.map((place) => join(homePath, place));
  const present = await Promise.all(candidates.map((candidate) => isDirectory(candidate)));
  return candidates.filter((_, index) => present[index]);
}

/** Why `path` may not be listed, or null when it may: inside home, outside Library, a folder. */
async function guardProblem(
  path: string,
  homePath: string,
  platform: NodeJS.Platform,
): Promise<string | null> {
  let realHome: string;
  let realPath: string;
  try {
    realHome = await realpath(homePath);
  } catch {
    return LIST_DIRECTORY_ERRORS.unreadable;
  }
  if (!isPathInsideRoot(homePath, path) && !isPathInsideRoot(realHome, path)) {
    return LIST_DIRECTORY_ERRORS.outsideHome;
  }
  const inLibrary = (root: string, candidate: string) =>
    platform === "darwin" && isPathInsideRoot(join(root, "Library"), candidate);
  if (inLibrary(homePath, path)) return LIST_DIRECTORY_ERRORS.library;
  try {
    realPath = await realpath(path);
  } catch {
    return LIST_DIRECTORY_ERRORS.notFound;
  }
  // A symlink inside home that leads out of it is outside.
  if (!isPathInsideRoot(realHome, realPath)) return LIST_DIRECTORY_ERRORS.outsideHome;
  if (inLibrary(realHome, realPath)) return LIST_DIRECTORY_ERRORS.library;
  return (await isDirectory(realPath)) ? null : LIST_DIRECTORY_ERRORS.notDirectory;
}

/** The subfolders of `path`, sorted by name, at most `LIST_DIRECTORY_LIMIT` of them. */
async function readSubfolders(
  path: string,
  hideLibrary: boolean,
): Promise<{ entries: DirectoryEntry[]; truncated: boolean }> {
  const dirents = await readdir(path, { withFileTypes: true });
  const candidates = await Promise.all(
    dirents.map(async (dirent) => {
      const childPath = join(path, dirent.name);
      const folder =
        dirent.isDirectory() || (dirent.isSymbolicLink() && (await isDirectory(childPath)));
      return folder ? { name: dirent.name, path: childPath } : null;
    }),
  );
  const folders = candidates.filter((candidate) => candidate !== null);
  const kept = folders
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }))
    .slice(0, LIST_DIRECTORY_LIMIT);
  const entries = await Promise.all(
    kept.map(async (folder) => ({
      name: folder.name,
      path: folder.path,
      hidden: folder.name.startsWith(".") || (hideLibrary && folder.name === "Library"),
      gitCheckout: await exists(join(folder.path, ".git")),
    })),
  );
  return { entries: entries.sort(byName), truncated: folders.length > LIST_DIRECTORY_LIMIT };
}

/**
 * The subfolders of `input.path` under the home guard: `~` and `~/...` allowed, a relative path
 * read from home, home when empty.
 */
export async function listDirectory(
  input: ListDirectoryInput,
  options: ListDirectoryOptions = {},
): Promise<DirectoryListing> {
  const homePath = resolve(options.homePath ?? process.env.HOME ?? homedir());
  const platform = options.platform ?? process.platform;
  const requested = typeof input.path === "string" && input.path.trim() ? input.path.trim() : "~";
  const path =
    requested === "~" || requested.startsWith("~/")
      ? resolve(join(homePath, requested.slice(1)))
      : resolve(homePath, requested);

  const problem = await guardProblem(path, homePath, platform);
  if (problem) return emptyListing(path, homePath, problem);

  const atHome = path === homePath;
  let listed: { entries: DirectoryEntry[]; truncated: boolean };
  try {
    listed = await readSubfolders(path, atHome && platform === "darwin");
  } catch {
    return emptyListing(path, homePath, LIST_DIRECTORY_ERRORS.unreadable);
  }
  return {
    path,
    homePath,
    parentPath: atHome ? null : resolve(path, ".."),
    entries: listed.entries,
    places: await usualPlaces(homePath),
    truncated: listed.truncated,
    error: null,
  };
}
