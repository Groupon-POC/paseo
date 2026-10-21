// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for the folder browser's rules.

import { describe, expect, it, vi } from "vitest";
import {
  GROUPON_DESK_RPC_PLUGIN_ID,
  LIST_DIRECTORY_METHOD,
  absolutePath,
  breadcrumbs,
  browserPlaces,
  browserRows,
  browserTarget,
  displayPath,
  hiddenToggleLabel,
  isTypedPath,
  parseFolderListing,
  readFolder,
  type FolderEntry,
  type FolderListing,
} from "./folder-browser-model";

const HOME = "/Users/ann";

function entry(name: string, extra: Partial<FolderEntry> = {}): FolderEntry {
  return { name, path: `${HOME}/${name}`, hidden: false, gitCheckout: false, ...extra };
}

function listing(path: string, entries: FolderEntry[]): FolderListing {
  return {
    path,
    homePath: HOME,
    parentPath: path === HOME ? null : path.slice(0, path.lastIndexOf("/")),
    entries,
    places: [],
    truncated: false,
    error: null,
  };
}

describe("parseFolderListing and readFolder", () => {
  it("reads the daemon's answer and drops entries of another shape", () => {
    const parsed = parseFolderListing({
      path: HOME,
      homePath: HOME,
      parentPath: null,
      entries: [entry("a"), { name: "b" }],
      places: [`${HOME}/Desktop`, 3],
      truncated: true,
      error: null,
    });
    expect(parsed.entries).toEqual([entry("a")]);
    expect(parsed.places).toEqual([`${HOME}/Desktop`]);
    expect(parsed.truncated).toBe(true);
  });

  it("throws on an older daemon's answer", () => {
    expect(() => parseFolderListing({ workspaces: [] })).toThrow(/update Groupon Desk/);
  });

  it("asks the groupon-desk built-in method for one path", async () => {
    const invokePluginRpc = vi.fn().mockResolvedValue(listing(HOME, []));
    await readFolder({ invokePluginRpc }, "~/Documents");
    expect(invokePluginRpc).toHaveBeenCalledWith(
      GROUPON_DESK_RPC_PLUGIN_ID,
      LIST_DIRECTORY_METHOD,
      {
        path: "~/Documents",
      },
    );
    expect(LIST_DIRECTORY_METHOD).toBe("groupon-desk.list-directory");
  });
});

describe("paths against that Mac's home", () => {
  it("shows and expands ~", () => {
    expect(displayPath(HOME, HOME)).toBe("~");
    expect(displayPath(`${HOME}/Documents/GitHub`, HOME)).toBe("~/Documents/GitHub");
    expect(displayPath("/Users/annabel/x", HOME)).toBe("/Users/annabel/x");
    expect(absolutePath("~", HOME)).toBe(HOME);
    expect(absolutePath("~/Developer", `${HOME}/`)).toBe(`${HOME}/Developer`);
    expect(absolutePath("/opt", HOME)).toBe("/opt");
  });

  it("tells a typed path from a word", () => {
    expect(isTypedPath("~")).toBe(true);
    expect(isTypedPath("~/Doc")).toBe(true);
    expect(isTypedPath("/Users")).toBe(true);
    expect(isTypedPath("GitHub")).toBe(false);
    expect(isTypedPath("~ann")).toBe(false);
  });
});

describe("browserTarget", () => {
  it("filters the folder looked at by a word, and Choose picks that folder", () => {
    expect(browserTarget(`${HOME}/Documents`, " git ")).toEqual({
      listPath: `${HOME}/Documents`,
      filter: "git",
      chosenPath: `${HOME}/Documents`,
    });
  });

  it("lists a typed path's parent narrowed to its last part, and Choose picks the path typed", () => {
    expect(browserTarget(HOME, "~/Doc")).toEqual({
      listPath: "~",
      filter: "Doc",
      chosenPath: "~/Doc",
    });
    expect(browserTarget(HOME, "/Users")).toEqual({
      listPath: "/",
      filter: "Users",
      chosenPath: "/Users",
    });
  });

  it("lists the typed folder itself once it ends in a slash", () => {
    expect(browserTarget(HOME, "~/Documents/")).toEqual({
      listPath: "~/Documents",
      filter: "",
      chosenPath: "~/Documents",
    });
    expect(browserTarget(HOME, "~")).toEqual({ listPath: "~", filter: "", chosenPath: "~" });
  });
});

describe("breadcrumbs", () => {
  it("starts at Home and walks down", () => {
    expect(breadcrumbs(`${HOME}/Documents/GitHub`, HOME)).toEqual([
      { label: "Home", path: HOME },
      { label: "Documents", path: `${HOME}/Documents` },
      { label: "GitHub", path: `${HOME}/Documents/GitHub` },
    ]);
  });

  it("is Home alone at the home folder, trailing slashes ignored", () => {
    expect(breadcrumbs(`${HOME}/`, `${HOME}/`)).toEqual([{ label: "Home", path: HOME }]);
  });

  it("starts at / outside home and never treats a look-alike folder as home", () => {
    expect(breadcrumbs("/Users/annabel", HOME)).toEqual([
      { label: "/", path: "/" },
      { label: "Users", path: "/Users" },
      { label: "annabel", path: "/Users/annabel" },
    ]);
  });
});

describe("browserPlaces", () => {
  it("puts the usual places first, then the folders that hold a checkout, alphabetically", () => {
    expect(
      browserPlaces({
        homePath: HOME,
        usual: [`${HOME}/Documents/GitHub`, `${HOME}/Desktop`],
        checkoutPaths: [
          `${HOME}/work/zeta/app`,
          "~/Documents/GitHub/paseo",
          `${HOME}/code/alpha`,
          `${HOME}/code/beta/`,
          `${HOME}/top`,
          "/opt/elsewhere/repo",
        ],
      }),
    ).toEqual([`${HOME}/Documents/GitHub`, `${HOME}/Desktop`, `${HOME}/code`, `${HOME}/work/zeta`]);
  });
});

describe("browserRows", () => {
  const home = listing(HOME, [
    entry(".config", { hidden: true }),
    entry("code"),
    entry("Desktop"),
    entry("Documents"),
    entry("Library", { hidden: true }),
    entry("paseo", { gitCheckout: true }),
  ]);
  const places = [`${HOME}/Documents/GitHub`, `${HOME}/Desktop`];

  it("at home: the places first, then the subfolders, hidden ones folded behind one row", () => {
    const rows = browserRows({ listing: home, places, filter: "", showHidden: false });
    expect(rows).toEqual([
      { kind: "place", path: `${HOME}/Documents/GitHub`, label: "~/Documents/GitHub" },
      { kind: "place", path: `${HOME}/Desktop`, label: "~/Desktop" },
      { kind: "folder", entry: entry("code") },
      { kind: "folder", entry: entry("Desktop") },
      { kind: "folder", entry: entry("Documents") },
      { kind: "folder", entry: entry("paseo", { gitCheckout: true }) },
      { kind: "hidden", count: 2, shown: false },
    ]);
  });

  it("unfolds the hidden folders in their alphabetical place when asked", () => {
    const rows = browserRows({ listing: home, places: [], filter: "", showHidden: true });
    expect(rows.map((row) => (row.kind === "folder" ? row.entry.name : row.kind))).toEqual([
      ".config",
      "code",
      "Desktop",
      "Documents",
      "Library",
      "paseo",
      "hidden",
    ]);
    expect(rows.at(-1)).toEqual({ kind: "hidden", count: 2, shown: true });
  });

  it("offers no places below home", () => {
    const below = listing(`${HOME}/code`, [entry("app")]);
    expect(browserRows({ listing: below, places, filter: "", showHidden: false })).toEqual([
      { kind: "folder", entry: entry("app") },
    ]);
  });

  it("filters by name, case ignored, names that start with it first", () => {
    const rows = browserRows({ listing: home, places, filter: "D", showHidden: false });
    expect(rows.map((row) => (row.kind === "folder" ? row.entry.name : row.kind))).toEqual([
      "place",
      "place",
      "Desktop",
      "Documents",
      "code",
    ]);
  });

  it("a filter that starts with a dot shows hidden folders with no toggle", () => {
    const rows = browserRows({ listing: home, places, filter: ".c", showHidden: false });
    expect(rows).toEqual([{ kind: "folder", entry: entry(".config", { hidden: true }) }]);
  });

  it("counts only the hidden folders the filter keeps", () => {
    const rows = browserRows({ listing: home, places: [], filter: "lib", showHidden: false });
    expect(rows).toEqual([{ kind: "hidden", count: 1, shown: false }]);
    expect(hiddenToggleLabel({ count: 1, shown: false })).toBe("Show 1 hidden folder");
    expect(hiddenToggleLabel({ count: 3, shown: false })).toBe("Show 3 hidden folders");
    expect(hiddenToggleLabel({ count: 3, shown: true })).toBe("Hide hidden folders");
  });

  it("has no rows without a listing or with the daemon's error", () => {
    expect(browserRows({ listing: null, places, filter: "", showHidden: false })).toEqual([]);
    expect(
      browserRows({
        listing: { ...home, error: "That folder does not exist." },
        places,
        filter: "",
        showHidden: false,
      }),
    ).toEqual([]);
  });
});
