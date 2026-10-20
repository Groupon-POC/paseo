// Changed for Groupon Desk (fork of Paseo, Apache-2.0): a running daemon the desktop did not start gets its local credential too; the window never starts one.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_DESKTOP_SETTINGS } from "../settings/desktop-settings";
import { createDaemonCommandHandlers } from "./daemon-manager";

const mocks = vi.hoisted(() => ({
  paseoHome: "",
  settings: {
    releaseChannel: "stable",
    daemon: {
      manageBuiltInDaemon: true,
      keepRunningAfterQuit: true,
    },
  },
  runExternalCliJsonCommand: vi.fn(),
  runExternalCliTextCommand: vi.fn(),
  createNodeEntrypointInvocation: vi.fn(() => ({
    command: "node",
    args: [],
    env: {},
  })),
  spawnProcess: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
  appLogPath: "",
  getElectronLogFile: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => mocks.paseoHome),
    getVersion: vi.fn(() => "1.2.3"),
    isPackaged: true,
  },
  ipcMain: { handle: vi.fn() },
  powerMonitor: { getSystemIdleTime: vi.fn(() => 0) },
}));

vi.mock("electron-log/main", () => ({
  default: {
    info: mocks.logInfo,
    error: mocks.logError,
    transports: {
      file: {
        getFile: mocks.getElectronLogFile,
      },
    },
  },
}));

vi.mock("@getpaseo/server/daemon-control", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolvePaseoHome: () => mocks.paseoHome,
  spawnProcess: mocks.spawnProcess,
}));

vi.mock("../settings/desktop-settings-electron.js", () => ({
  getDesktopSettingsStore: () => ({
    get: async () => mocks.settings,
    patch: vi.fn(),
    migrateLegacyRendererSettings: vi.fn(),
  }),
}));

vi.mock("./runtime-paths.js", () => ({
  createNodeEntrypointInvocation: mocks.createNodeEntrypointInvocation,
  resolveDaemonRunnerEntrypoint: vi.fn(() => ({
    entryPath: path.join(mocks.paseoHome, "daemon.js"),
    execArgv: [],
  })),
}));

vi.mock("./cli/external.js", () => ({
  runExternalCliJsonCommand: mocks.runExternalCliJsonCommand,
  runExternalCliTextCommand: mocks.runExternalCliTextCommand,
}));

describe("daemon-manager commands", () => {
  let fixtureRoot: string;

  beforeEach(() => {
    fixtureRoot = mkdtempSync(path.join(tmpdir(), "paseo daemon manager "));
    mocks.paseoHome = path.join(fixtureRoot, "home");
    mocks.appLogPath = path.join(fixtureRoot, "main.log");
    mocks.settings = DEFAULT_DESKTOP_SETTINGS;
    mocks.runExternalCliJsonCommand.mockReset();
    mocks.runExternalCliTextCommand.mockReset();
    mocks.createNodeEntrypointInvocation.mockReset();
    mocks.createNodeEntrypointInvocation.mockReturnValue({ command: "node", args: [], env: {} });
    mocks.spawnProcess.mockReset();
    mocks.logInfo.mockReset();
    mocks.logError.mockReset();
    mocks.getElectronLogFile.mockReset();
    mocks.getElectronLogFile.mockReturnValue({ path: mocks.appLogPath });
  });

  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("returns the Electron main-process log tail from electron-log", () => {
    writeFileSync(
      mocks.appLogPath,
      Array.from({ length: 105 }, (_value, index) => `main log line ${index + 1}`).join("\n"),
    );
    const handlers = createDaemonCommandHandlers();

    expect(handlers.desktop_app_logs()).toEqual({
      logPath: mocks.appLogPath,
      contents: Array.from({ length: 100 }, (_value, index) => `main log line ${index + 6}`).join(
        "\n",
      ),
    });
  });

  it("exposes updater diagnostics through the desktop command boundary", () => {
    const diagnostics = createDaemonCommandHandlers().desktop_update_diagnostics();

    expect(diagnostics).toMatchObject({
      platform: process.platform,
      currentVersion: "1.2.3",
    });
  });

  it("reports a stopped daemon without launching the CLI when no local daemon runs", async () => {
    mkdirSync(mocks.paseoHome);
    writeFileSync(path.join(mocks.paseoHome, "server-id"), "srv_existing\n");
    mocks.runExternalCliJsonCommand.mockResolvedValue({
      home: mocks.paseoHome,
      pid: null,
      startedAt: null,
      listen: null,
      hostname: null,
      localDaemon: "stopped",
      desktopManaged: false,
      connectedDaemon: "not_probed",
    });

    const status = await createDaemonCommandHandlers().desktop_daemon_status();

    expect(status).toMatchObject({ serverId: "", status: "stopped", pid: null });
    expect(mocks.runExternalCliJsonCommand).not.toHaveBeenCalled();
  });

  it("reports no daemon of its own, without the CLI, even with a daemon in its home", async () => {
    // The hand owns this Mac's daemon: one a Paseo window once started is not the window's.
    mkdirSync(mocks.paseoHome);
    writeFileSync(
      path.join(mocks.paseoHome, "paseo.pid"),
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), listen: "x:1" }),
    );

    const status = await createDaemonCommandHandlers().desktop_daemon_status();

    expect(status).toMatchObject({ serverId: "", status: "stopped", pid: null, error: null });
    expect(mocks.runExternalCliJsonCommand).not.toHaveBeenCalled();
  });

  it("refuses to start or restart a daemon: the hand alone runs one", async () => {
    const handlers = createDaemonCommandHandlers();
    await expect(handlers.start_desktop_daemon()).rejects.toThrow(/hand runs this Mac's daemon/);
    await expect(handlers.restart_desktop_daemon()).rejects.toThrow(/hand runs this Mac's daemon/);
    expect(mocks.createNodeEntrypointInvocation).not.toHaveBeenCalled();
    expect(mocks.runExternalCliJsonCommand).not.toHaveBeenCalled();
  });

  it("returns a local credential only for a live daemon's own listen", async () => {
    vi.stubEnv("HOME", mocks.paseoHome);
    const handHome = path.join(mocks.paseoHome, ".groupon", "paseo");
    mkdirSync(handHome, { recursive: true });
    const token = "a".repeat(43);
    writeFileSync(path.join(handHome, "local-credential"), `${token}\n`, { mode: 0o600 });
    const lock = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      hostname: hostname(),
      uid: process.getuid?.() ?? 0,
      listen: "127.0.0.1:6799",
      desktopManaged: true,
    };
    const lockPath = path.join(handHome, "paseo.pid");
    writeFileSync(lockPath, JSON.stringify(lock));
    const handler = createDaemonCommandHandlers().desktop_local_credential;
    expect(await handler({ listen: "localhost:6799" })).toBe(token);
    expect(await handler({ listen: "remote:6799" })).toBeNull();
    // Groupon Desk's hand starts the daemon itself: still this Mac's, still its own credential.
    writeFileSync(lockPath, JSON.stringify({ ...lock, desktopManaged: false }));
    expect(await handler({ listen: "localhost:6799" })).toBe(token);
    // A pid file whose process is gone is no daemon.
    writeFileSync(lockPath, JSON.stringify({ ...lock, pid: 2 ** 22 + 17 }));
    expect(await handler({ listen: "localhost:6799" })).toBeNull();
    vi.unstubAllEnvs();
  });

  it("names this Mac's running daemons by server id and listen address", async () => {
    // The hand's home is under HOME: point HOME at the test's own folder, never the person's.
    vi.stubEnv("HOME", mocks.paseoHome);
    const handHome = path.join(mocks.paseoHome, ".groupon", "paseo");
    mkdirSync(handHome, { recursive: true });
    const lock = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      hostname: hostname(),
      uid: process.getuid?.() ?? 0,
      listen: "127.0.0.1:6870",
      serverId: "srv_test",
    };
    writeFileSync(path.join(handHome, "paseo.pid"), JSON.stringify(lock));
    const daemons = await createDaemonCommandHandlers().groupon_local_daemons();
    expect(daemons).toEqual([{ serverId: "srv_test", listen: "127.0.0.1:6870" }]);
    vi.unstubAllEnvs();
  });
});
