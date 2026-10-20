// Changed for Groupon Desk (fork of Paseo, Apache-2.0): the substrate is .groupon/desk.toml.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isPlatform } from "../test-utils/platform.js";
import { getWorktreeSetupCommands, getWorktreeTeardownCommands } from "./worktree.js";
import {
  readPaseoConfigForEdit,
  statPaseoConfigPath,
  writePaseoConfigForEdit,
} from "./paseo-config-file.js";
import { projectConfigText, writeProjectConfig } from "../test-utils/project-config.js";

const OWNED_COMMENT =
  "# The work window's own sections: what it runs when it prepares or archives a worktree and its Run menu (written by its Projects page).";

describe("paseo config file substrate", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = realpathSync(mkdtempSync(join(tmpdir(), "paseo-config-file-test-")));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns null config and revision when .groupon/desk.toml is missing", () => {
    const result = readPaseoConfigForEdit(tempDir);

    expect(result).toEqual({ ok: true, config: null, revision: null });
  });

  it("returns invalid_project_config for a file that is not TOML", () => {
    writeProjectConfig(tempDir, "[worktree\nsetup = \n");

    const result = readPaseoConfigForEdit(tempDir);

    expect(result).toEqual({
      ok: false,
      error: { code: "invalid_project_config" },
    });
  });

  it("preserves raw lifecycle string and array forms with a revision token", () => {
    writeProjectConfig(tempDir, {
      worktree: {
        setup: "npm install",
        teardown: ["npm run clean", "npm run reset"],
      },
    });

    const result = readPaseoConfigForEdit(tempDir);

    expect(result).toEqual({
      ok: true,
      config: {
        worktree: {
          setup: "npm install",
          teardown: ["npm run clean", "npm run reset"],
        },
      },
      revision: statPaseoConfigPath(tempDir),
    });
  });

  it("keeps runtime lifecycle commands normalized for execution", () => {
    writeProjectConfig(tempDir, {
      worktree: {
        setup: "npm install",
        teardown: ["npm run clean", "", 42, "npm run reset"],
      },
    });

    expect(getWorktreeSetupCommands(tempDir)).toEqual(["npm install"]);
    expect(getWorktreeTeardownCommands(tempDir)).toEqual(["npm run clean", "npm run reset"]);
  });

  it("writes the work window's sections as TOML when revision matches", () => {
    writeProjectConfig(tempDir, { worktree: { setup: "old" } });
    const expectedRevision = statPaseoConfigPath(tempDir);

    const result = writePaseoConfigForEdit({
      repoRoot: tempDir,
      config: { worktree: { setup: "npm install" } },
      expectedRevision,
    });

    expect(result).toEqual({
      ok: true,
      config: { worktree: { setup: "npm install" } },
      revision: statPaseoConfigPath(tempDir),
    });
    expect(readFileSync(join(tempDir, ".groupon/desk.toml"), "utf8")).toBe(
      `${OWNED_COMMENT}\n[worktree]\nsetup = "npm install"\n`,
    );
  });

  // POSIX-only: Windows mtime granularity can collapse the two revisions in this fixture.
  it.skipIf(isPlatform("win32"))(
    "rejects stale writes when the current revision changed before rename",
    () => {
      writeProjectConfig(tempDir, { worktree: { setup: "old" } });
      const expectedRevision = statPaseoConfigPath(tempDir);
      writeProjectConfig(tempDir, { worktree: { setup: "new" } });
      const currentRevision = statPaseoConfigPath(tempDir);

      const result = writePaseoConfigForEdit({
        repoRoot: tempDir,
        config: { worktree: { setup: "from editor" } },
        expectedRevision,
      });

      expect(result).toEqual({
        ok: false,
        error: { code: "stale_project_config", currentRevision },
      });
      expect(readFileSync(join(tempDir, ".groupon/desk.toml"), "utf8")).toBe(
        projectConfigText({ worktree: { setup: "new" } }),
      );
    },
  );

  it("round-trips unknown worktree and script-entry fields, never writes another top-level key", () => {
    const config = {
      worktree: {
        setup: ["npm install"],
        customWorktreeField: "preserve me",
      },
      scripts: {
        dev: {
          command: "npm run dev",
          type: "service",
          customScriptField: 123,
        },
      },
    };

    const result = writePaseoConfigForEdit({
      repoRoot: tempDir,
      config: { ...config, extraTop: { keep: true } },
      expectedRevision: null,
    });

    expect(result).toEqual({
      ok: true,
      config,
      revision: statPaseoConfigPath(tempDir),
    });
    expect(readPaseoConfigForEdit(tempDir)).toEqual({
      ok: true,
      config,
      revision: statPaseoConfigPath(tempDir),
    });
  });

  it("returns write_failed for filesystem write exceptions", () => {
    const fileRoot = join(tempDir, "not-a-directory");
    writeFileSync(fileRoot, "file");

    const result = writePaseoConfigForEdit({
      repoRoot: fileRoot,
      config: { worktree: { setup: "npm install" } },
      expectedRevision: null,
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "write_failed" },
    });
  });

  it("creates .groupon/desk.toml when the file is still missing and expected revision is null", () => {
    mkdirSync(join(tempDir, "nested"));

    const result = writePaseoConfigForEdit({
      repoRoot: join(tempDir, "nested"),
      config: { scripts: { dev: { command: "npm run dev" } } },
      expectedRevision: null,
    });

    expect(result).toEqual({
      ok: true,
      config: { scripts: { dev: { command: "npm run dev" } } },
      revision: statPaseoConfigPath(join(tempDir, "nested")),
    });
  });

  it("keeps Groupon Desk's own sections and comments byte for byte and replaces its own in place", () => {
    const desk = [
      "# How a task is prepared here.",
      "[scripts]",
      'setup = "pnpm install"',
      "",
      "[scripts.run.core]",
      'command = "pnpm backend:core"',
      "",
      "# old comment of the window's section",
      "[worktree]",
      'setup = "old"',
      "",
      "[scripts.web]",
      'command = "old web"',
      "",
      "[git]",
      'target_branch = "staging"',
      "",
    ].join("\n");
    writeProjectConfig(tempDir, desk);

    const result = writePaseoConfigForEdit({
      repoRoot: tempDir,
      config: {
        worktree: { setup: "groupon desk repo setup" },
        scripts: { web: { command: "new web" } },
      },
      expectedRevision: statPaseoConfigPath(tempDir),
    });

    expect(result.ok).toBe(true);
    expect(readFileSync(join(tempDir, ".groupon/desk.toml"), "utf8")).toBe(
      [
        "# How a task is prepared here.",
        "[scripts]",
        'setup = "pnpm install"',
        "",
        "[scripts.run.core]",
        'command = "pnpm backend:core"',
        "",
        OWNED_COMMENT,
        "[worktree]",
        'setup = "groupon desk repo setup"',
        "",
        "[scripts.web]",
        'command = "new web"',
        "",
        "[git]",
        'target_branch = "staging"',
        "",
      ].join("\n"),
    );
    expect(readPaseoConfigForEdit(tempDir)).toMatchObject({
      ok: true,
      config: {
        worktree: { setup: "groupon desk repo setup" },
        scripts: { web: { command: "new web" } },
      },
    });
  });

  it("reads the desk's own [scripts] keys as no work window script", () => {
    writeProjectConfig(
      tempDir,
      '[scripts]\nsetup = "pnpm install"\nrun_mode = "concurrent"\n\n[scripts.run.core]\ncommand = "pnpm backend:core"\n\n[scripts.core]\ncommand = "groupon desk repo run core"\n',
    );

    expect(readPaseoConfigForEdit(tempDir)).toMatchObject({
      ok: true,
      config: { scripts: { core: { command: "groupon desk repo run core" } } },
    });
  });

  it("refuses a script named like one of the desk's own [scripts] keys", () => {
    const result = writePaseoConfigForEdit({
      repoRoot: tempDir,
      config: { scripts: { run: { command: "npm start" } } },
      expectedRevision: null,
    });

    expect(result).toEqual({ ok: false, error: { code: "invalid_project_config" } });
    expect(existsSync(join(tempDir, ".groupon/desk.toml"))).toBe(false);
  });

  it("never reads a paseo.json at the repository root", () => {
    writeFileSync(join(tempDir, "paseo.json"), JSON.stringify({ worktree: { setup: "npm ci" } }));

    expect(readPaseoConfigForEdit(tempDir)).toEqual({ ok: true, config: null, revision: null });
    expect(getWorktreeSetupCommands(tempDir)).toEqual([]);
  });
});
