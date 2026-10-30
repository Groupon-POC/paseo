// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for reading what a background shell call printed.

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  backgroundOutputOf,
  backgroundOutputRequestOf,
  readBackgroundOutput,
} from "./background-output.js";

const uid = userInfo().uid;
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("backgroundOutputRequestOf", () => {
  it("takes only a task output file of this user's Claude Code", () => {
    const own = `/private/tmp/claude-${uid}/-Users-nick-x/d0ada04a/tasks/by4e81z01.output`;
    expect(backgroundOutputRequestOf({ path: own })).toEqual({ path: own });
    for (const path of [
      `/private/tmp/claude-${uid + 1}/p/s/tasks/a.output`,
      `/private/tmp/claude-${uid}/p/../../etc/tasks/a.output`,
      `/private/tmp/claude-${uid}/p/s/tasks/a.txt`,
      "/etc/passwd",
      42,
    ]) {
      expect(() => backgroundOutputRequestOf({ path })).toThrow(/output file/);
    }
  });
});

describe("backgroundOutputOf", () => {
  it("splits off the exit code once the task has finished", () => {
    expect(backgroundOutputOf("To x\n   1a..2b  main -> main\n\n[exited with code 0]\n")).toEqual({
      output: "To x\n   1a..2b  main -> main\n",
      exitCode: 0,
    });
    expect(backgroundOutputOf("Enumerating objects")).toEqual({
      output: "Enumerating objects",
      exitCode: null,
    });
  });
});

describe("readBackgroundOutput", () => {
  it("reads the file and refuses a link that leads elsewhere", async () => {
    const root = mkdtempSync(`/private/tmp/claude-${uid}/groupon-test-`);
    roots.push(root);
    const tasks = join(root, "s", "tasks");
    mkdirSync(tasks, { recursive: true });
    writeFileSync(join(tasks, "a.output"), "done\n[exited with code 1]\n");
    await expect(readBackgroundOutput(join(tasks, "a.output"))).resolves.toEqual({
      output: "done",
      exitCode: 1,
    });
    symlinkSync("/etc/hosts", join(tasks, "b.output"));
    await expect(readBackgroundOutput(join(tasks, "b.output"))).rejects.toThrow(/outside/);
  });
});
