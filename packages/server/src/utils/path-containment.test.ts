// Added for Groupon Desk (fork of Paseo, Apache-2.0): `createRealpathAwareContainmentMatcher` answers as `isRealpathInsideRoot` does, and a candidate written inside a root is never resolved on disk (ledger WW-96).
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const realpathCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const counted = Object.assign(
    (path: string) => {
      realpathCalls.count += 1;
      return actual.realpathSync(path);
    },
    {
      native: (path: string) => {
        realpathCalls.count += 1;
        return actual.realpathSync.native(path);
      },
    },
  );
  return { ...actual, realpathSync: counted, default: { ...actual, realpathSync: counted } };
});

const { createRealpathAwareContainmentMatcher, isRealpathInsideRoot } = await import("./path.js");

describe.skipIf(process.platform === "win32")("createRealpathAwareContainmentMatcher", () => {
  let tempDir = "";
  let realRoot = "";
  let aliasRoot = "";
  let ignored = "";

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "paseo-containment-"));
    realRoot = join(tempDir, "real-root");
    ignored = join(realRoot, "node_modules");
    mkdirSync(join(ignored, ".pnpm", "react"), { recursive: true });
    mkdirSync(join(realRoot, "src"), { recursive: true });
    aliasRoot = join(tempDir, "root-alias");
    symlinkSync(realRoot, aliasRoot, "dir");
    realpathCalls.count = 0;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("answers as isRealpathInsideRoot asked root by root, through a symlinked root or candidate", () => {
    const roots = [join(aliasRoot, ".git"), join(aliasRoot, "node_modules")];
    const inside = createRealpathAwareContainmentMatcher(roots);
    const candidates = [
      join(realRoot, "node_modules", ".pnpm", "react"),
      join(aliasRoot, "node_modules", ".pnpm", "react"),
      join(aliasRoot, "node_modules"),
      join(realRoot, "src"),
      join(aliasRoot, "src", "index.ts"),
      join(tempDir, "elsewhere"),
      `${join(realRoot, "node_modules")}/`,
      `${join(realRoot, "node_modules")}/../src`,
      `${realRoot}/node_modules-other/x`,
      "/",
    ];
    for (const candidate of candidates) {
      const expected = roots.some((root) => isRealpathInsideRoot(root, candidate));
      expect(inside(candidate), candidate).toBe(expected);
    }
    expect(inside(join(realRoot, "node_modules", ".pnpm", "react"))).toBe(true);
    expect(inside(join(realRoot, "src"))).toBe(false);
  });

  test("resolves each root once and no candidate that is written inside a root", () => {
    const inside = createRealpathAwareContainmentMatcher([join(realRoot, ".git"), ignored]);
    const afterRoots = realpathCalls.count;
    expect(afterRoots).toBeLessThanOrEqual(4);
    for (let index = 0; index < 5_000; index += 1) {
      expect(inside(join(ignored, ".pnpm", `package-${index}`, "index.js"))).toBe(true);
    }
    expect(realpathCalls.count).toBe(afterRoots);
  });

  test("resolves a candidate written outside every root once, not once per root", () => {
    const roots = [
      join(realRoot, ".git"),
      ignored,
      join(realRoot, "dist"),
      join(realRoot, "build"),
    ];
    const inside = createRealpathAwareContainmentMatcher(roots);
    const afterRoots = realpathCalls.count;
    expect(inside(join(realRoot, "src"))).toBe(false);
    expect(realpathCalls.count - afterRoots).toBe(2);
  });

  test("answers Windows-shaped roots and candidates as isRealpathInsideRoot does", () => {
    const roots = ["C:\\Repo\\node_modules", "/opt/repo/.git"];
    const inside = createRealpathAwareContainmentMatcher(roots);
    for (const candidate of [
      "c:/repo/node_modules/react/index.js",
      "C:\\Repo\\src\\index.ts",
      "/opt/repo/.git/HEAD",
      "/opt/repo/.github/x",
    ]) {
      const expected = roots.some((root) => isRealpathInsideRoot(root, candidate));
      expect(inside(candidate), candidate).toBe(expected);
    }
  });
});
