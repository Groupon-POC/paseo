// Changed for Groupon Desk (fork of Paseo, Apache-2.0): the Helper named after the product, not the executable.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findMacNodeHelperPath, resolveNodeExecPath } from "./runtime-paths";

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  app: {
    isPackaged: true,
  },
}));

vi.mock("node:fs", () => ({
  existsSync: mocks.existsSync,
  readdirSync: mocks.readdirSync,
  readFileSync: vi.fn(),
}));

vi.mock("electron", () => ({
  app: mocks.app,
}));

vi.mock("electron-log/main", () => ({
  default: { warn: vi.fn() },
}));

const originalPlatform = process.platform;
const originalExecPath = process.execPath;
const originalResourcesPath = process.resourcesPath;

function setProcessRuntime(input: {
  platform: NodeJS.Platform;
  execPath: string;
  resourcesPath?: string;
}): void {
  Object.defineProperty(process, "platform", {
    configurable: true,
    value: input.platform,
  });
  Object.defineProperty(process, "execPath", {
    configurable: true,
    value: input.execPath,
  });
  Object.defineProperty(process, "resourcesPath", {
    configurable: true,
    value: input.resourcesPath,
  });
}

describe("runtime-paths", () => {
  beforeEach(() => {
    mocks.app.isPackaged = true;
    mocks.existsSync.mockReturnValue(true);
    setProcessRuntime({
      platform: "darwin",
      execPath: "/Applications/Paseo.app/Contents/MacOS/Paseo",
      resourcesPath: "/Applications/Paseo.app/Contents/Resources",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setProcessRuntime({
      platform: originalPlatform,
      execPath: originalExecPath,
      resourcesPath: originalResourcesPath,
    });
  });

  it("uses the macOS Helper executable for packaged daemon node launches", () => {
    expect(resolveNodeExecPath()).toBe(
      "/Applications/Paseo.app/Contents/Frameworks/Paseo Helper.app/Contents/MacOS/Paseo Helper",
    );
  });

  it("finds the Helper named after the product when the executable keeps Paseo's name", () => {
    const bundle = "/Applications/Groupon Desk.app/Contents/Helpers/Groupon Desk Work.app/Contents";
    setProcessRuntime({ platform: "darwin", execPath: `${bundle}/MacOS/Paseo` });
    const helper = `${bundle}/Frameworks/Groupon Desk Helper.app/Contents/MacOS/Groupon Desk Helper`;
    mocks.existsSync.mockImplementation((filePath: string) => filePath === helper);
    mocks.readdirSync.mockReturnValue([
      "Electron Framework.framework",
      "Groupon Desk Helper (GPU).app",
      "Groupon Desk Helper (Renderer).app",
      "Groupon Desk Helper.app",
    ]);
    expect(resolveNodeExecPath()).toBe(helper);
  });
});

describe("findMacNodeHelperPath", () => {
  const execPath = "/A/Groupon Desk Work.app/Contents/MacOS/Paseo";

  it("never picks a GPU, Renderer or Plugin Helper", () => {
    expect(
      findMacNodeHelperPath(execPath, {
        exists: (filePath) => !filePath.includes("Paseo Helper"),
        listDir: () => ["Groupon Desk Helper (GPU).app", "Groupon Desk Helper (Plugin).app"],
      }),
    ).toBeNull();
  });

  it("answers null outside an app bundle or when the Frameworks folder cannot be read", () => {
    const exists = () => false;
    expect(findMacNodeHelperPath("/usr/local/bin/node", { exists, listDir: () => [] })).toBeNull();
    expect(
      findMacNodeHelperPath(execPath, {
        exists,
        listDir: () => {
          throw new Error("ENOENT");
        },
      }),
    ).toBeNull();
  });
});
