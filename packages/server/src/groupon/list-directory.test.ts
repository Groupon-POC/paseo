// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for the folder browser's directory listing.

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { LIST_DIRECTORY_ERRORS, LIST_DIRECTORY_METHOD, listDirectory } from "./list-directory.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function tempHome(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "list-directory-")));
  tempDirectories.push(dir);
  return dir;
}

function folders(home: string, ...paths: string[]): void {
  for (const path of paths) mkdirSync(join(home, path), { recursive: true });
}

describe("listDirectory", () => {
  test("is the groupon-desk built-in method name", () => {
    expect(LIST_DIRECTORY_METHOD).toBe("groupon-desk.list-directory");
  });

  test("lists home's subfolders alphabetically, numbers in order, files left out", async () => {
    const home = tempHome();
    folders(home, "zeta", "Alpha", "beta", "v10", "v9");
    writeFileSync(join(home, "notes.txt"), "x");

    const listing = await listDirectory({}, { homePath: home, platform: "darwin" });

    expect(listing.error).toBeNull();
    expect(listing.path).toBe(home);
    expect(listing.homePath).toBe(home);
    expect(listing.parentPath).toBeNull();
    expect(listing.entries.map((entry) => entry.name)).toEqual([
      "Alpha",
      "beta",
      "v9",
      "v10",
      "zeta",
    ]);
    expect(listing.truncated).toBe(false);
  });

  test("flags dot folders and macOS's ~/Library as hidden, and checkouts by their .git", async () => {
    const home = tempHome();
    folders(home, ".config", "Library", "repo/.git", "worktree", "plain");
    writeFileSync(join(home, "worktree", ".git"), "gitdir: /elsewhere");

    const listing = await listDirectory({ path: "~" }, { homePath: home, platform: "darwin" });
    const byName = new Map(listing.entries.map((entry) => [entry.name, entry]));

    expect(byName.get(".config")?.hidden).toBe(true);
    expect(byName.get("Library")?.hidden).toBe(true);
    expect(byName.get("plain")).toEqual({
      name: "plain",
      path: join(home, "plain"),
      hidden: false,
      gitCheckout: false,
    });
    expect(byName.get("repo")?.gitCheckout).toBe(true);
    expect(byName.get("worktree")?.gitCheckout).toBe(true);
  });

  test("Library is an ordinary folder off macOS", async () => {
    const home = tempHome();
    folders(home, "Library");
    const listing = await listDirectory({}, { homePath: home, platform: "linux" });
    expect(listing.entries[0]?.hidden).toBe(false);
  });

  test("reads ~/... paths and relative paths from home, and names the folder above", async () => {
    const home = tempHome();
    folders(home, "Documents/GitHub/one", "Documents/GitHub/two");

    const byTilde = await listDirectory({ path: "~/Documents/GitHub" }, { homePath: home });
    const byRelative = await listDirectory({ path: "Documents/GitHub/" }, { homePath: home });
    const byAbsolute = await listDirectory(
      { path: join(home, "Documents", "GitHub") },
      { homePath: home },
    );

    for (const listing of [byTilde, byRelative, byAbsolute]) {
      expect(listing.path).toBe(join(home, "Documents", "GitHub"));
      expect(listing.parentPath).toBe(join(home, "Documents"));
      expect(listing.entries.map((entry) => entry.name)).toEqual(["one", "two"]);
    }
  });

  test("names the usual places that exist, nearest first", async () => {
    const home = tempHome();
    folders(home, "Documents/GitHub", "Desktop");

    const listing = await listDirectory({}, { homePath: home });

    expect(listing.places).toEqual([
      join(home, "Documents", "GitHub"),
      join(home, "Desktop"),
      join(home, "Documents"),
    ]);
  });

  test("refuses a folder outside home, by path or by ..", async () => {
    const home = tempHome();
    const outside = tempHome();

    for (const path of [outside, "~/..", "/", "../"]) {
      const listing = await listDirectory({ path }, { homePath: home });
      expect(listing.error).toBe(LIST_DIRECTORY_ERRORS.outsideHome);
      expect(listing.entries).toEqual([]);
    }
  });

  test("refuses a symlink inside home that leads out of it, and never lists it as a way out", async () => {
    const home = tempHome();
    const outside = tempHome();
    folders(outside, "secret");
    symlinkSync(outside, join(home, "escape"));

    const listing = await listDirectory({ path: "~/escape" }, { homePath: home });

    expect(listing.error).toBe(LIST_DIRECTORY_ERRORS.outsideHome);
    expect(listing.entries).toEqual([]);
  });

  test("follows a symlink to a folder inside home", async () => {
    const home = tempHome();
    folders(home, "real/inner");
    symlinkSync(join(home, "real"), join(home, "link"));

    const top = await listDirectory({}, { homePath: home });
    const inside = await listDirectory({ path: "~/link" }, { homePath: home });

    expect(top.entries.map((entry) => entry.name)).toEqual(["link", "real"]);
    expect(inside.entries.map((entry) => entry.name)).toEqual(["inner"]);
  });

  test("never reads under ~/Library on macOS", async () => {
    const home = tempHome();
    folders(home, "Library/Mail");
    const listing = await listDirectory(
      { path: "~/Library" },
      { homePath: home, platform: "darwin" },
    );
    expect(listing.error).toBe(LIST_DIRECTORY_ERRORS.library);
  });

  test("says a missing folder and a file in one line, without throwing", async () => {
    const home = tempHome();
    writeFileSync(join(home, "file.txt"), "x");

    const missing = await listDirectory({ path: "~/nope" }, { homePath: home });
    const file = await listDirectory({ path: "~/file.txt" }, { homePath: home });

    expect(missing.error).toBe(LIST_DIRECTORY_ERRORS.notFound);
    expect(file.error).toBe(LIST_DIRECTORY_ERRORS.notDirectory);
  });

  test("a path that is not a string reads as home", async () => {
    const home = tempHome();
    const listing = await listDirectory({ path: 42 }, { homePath: home });
    expect(listing.path).toBe(home);
    expect(listing.error).toBeNull();
  });
});
