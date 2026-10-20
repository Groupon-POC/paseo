// Changed for Groupon Desk (fork of Paseo, Apache-2.0): node-mode children run as the bundle's Helper whatever the product name, so none gets a Dock tile.
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { app } from "electron";
import {
  createNodeEntrypointInvocation as createSharedNodeEntrypointInvocation,
  type NodeEntrypointArgvMode,
  type NodeEntrypointInvocation,
  type NodeEntrypointSpec,
} from "./node-entrypoint-launcher.js";
import {
  assertPathExists,
  findPackageRootFromResolvedPath,
  resolvePackagedAsarPath,
  type PackageInfo,
} from "./package-paths.js";

const SERVER_PACKAGE_NAME = "@getpaseo/server";

const esmRequire = createRequire(__filename);

function resolveServerPackageInfo(): PackageInfo {
  const serverExportPath = esmRequire.resolve(SERVER_PACKAGE_NAME);
  return findPackageRootFromResolvedPath({
    resolvedPath: serverExportPath,
    packageName: SERVER_PACKAGE_NAME,
  });
}

export function resolvePackagedNodeEntrypointRunnerPath(): string {
  return path.join(
    process.resourcesPath,
    "app.asar.unpacked",
    "dist",
    "daemon",
    "node-entrypoint-runner.js",
  );
}

export function resolveDaemonRunnerEntrypoint(): NodeEntrypointSpec {
  if (app.isPackaged) {
    return {
      entryPath: assertPathExists({
        label: "Bundled daemon runner",
        filePath: path.join(
          resolvePackagedAsarPath(),
          "node_modules",
          "@getpaseo",
          "server",
          "dist",
          "scripts",
          "supervisor-entrypoint.js",
        ),
      }),
      execArgv: [],
    };
  }

  const serverPackage = resolveServerPackageInfo();
  const distRunner = path.join(serverPackage.root, "dist", "scripts", "supervisor-entrypoint.js");
  if (existsSync(distRunner)) {
    return {
      entryPath: distRunner,
      execArgv: [],
    };
  }

  return {
    entryPath: assertPathExists({
      label: "Daemon runner source",
      filePath: path.join(serverPackage.root, "scripts", "supervisor-entrypoint.ts"),
    }),
    execArgv: ["--import", "tsx"],
  };
}

/**
 * The macOS Helper that runs a node-mode child (the CLI, a daemon) without a Dock tile: its
 * Info.plist carries LSUIElement. Node's `process.title` checks a process in with LaunchServices,
 * so a child started from the bundle's main executable instead becomes a Foreground app with its
 * own bouncing Dock tile. electron-builder names the Helper after `productName`, which in Groupon
 * Desk ("Groupon Desk Work Helper.app") is not the executable's name (`Paseo`); upstream they match.
 */
export function findMacNodeHelperPath(
  execPath: string,
  deps: {
    exists: (filePath: string) => boolean;
    listDir: (dirPath: string) => string[];
  },
): string | null {
  const marker = ".app/Contents/MacOS/";
  const markerIndex = execPath.indexOf(marker);
  if (markerIndex === -1) return null;
  const bundleRoot = execPath.substring(0, markerIndex + ".app".length);
  const frameworks = path.posix.join(bundleRoot, "Contents", "Frameworks");
  const helperExecutable = (helperName: string) =>
    path.posix.join(frameworks, `${helperName}.app`, "Contents", "MacOS", helperName);

  const byExecutableName = helperExecutable(`${path.basename(execPath)} Helper`);
  if (deps.exists(byExecutableName)) return byExecutableName;

  let entries: string[] = [];
  try {
    entries = deps.listDir(frameworks);
  } catch {
    return null;
  }
  // The plain Helper, never one of its (GPU), (Renderer) or (Plugin) variants.
  const plain = entries.find((entry) => /^[^()]+ Helper\.app$/.test(entry));
  if (!plain) return null;
  const byProductName = helperExecutable(plain.slice(0, -".app".length));
  return deps.exists(byProductName) ? byProductName : null;
}

export function resolveNodeExecPath(): string {
  if (app.isPackaged && process.platform === "darwin") {
    const helperPath = findMacNodeHelperPath(process.execPath, {
      exists: existsSync,
      listDir: (dirPath) => readdirSync(dirPath),
    });
    if (helperPath) {
      return helperPath;
    }
  }
  return process.execPath;
}

export function createNodeEntrypointInvocation(input: {
  entrypoint: NodeEntrypointSpec;
  argvMode: NodeEntrypointArgvMode;
  args: string[];
  baseEnv: NodeJS.ProcessEnv;
}): NodeEntrypointInvocation {
  return createSharedNodeEntrypointInvocation({
    execPath: resolveNodeExecPath(),
    isPackaged: app.isPackaged,
    packagedRunnerPath: app.isPackaged
      ? assertPathExists({
          label: "Bundled node entrypoint runner",
          filePath: resolvePackagedNodeEntrypointRunnerPath(),
        })
      : null,
    entrypoint: input.entrypoint,
    argvMode: input.argvMode,
    args: input.args,
    baseEnv: input.baseEnv,
  });
}
