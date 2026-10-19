// Added for Groupon Desk (fork of Paseo, Apache-2.0): a development run's Electron bundle, named Groupon Desk DEV.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

export const DEV_APP_NAME = "Groupon Desk DEV";

// macOS takes the Dock label and the menu bar's bold application title from the running bundle's
// Info.plist, never from app.setName(), so a development run launched from the stock Electron.app
// reads "Electron" there. This launches a copy of Electron.app named Groupon Desk DEV instead.
// The copy is an APFS clone (no extra disk) and is rebuilt when the Electron version changes; the
// stock bundle in node_modules is never modified. Electron's bundle does not bind its Info.plist
// into its signature, so the edited copy runs without re-signing.
export function resolveDevElectronBinary({ platform, electronBinary, cacheDir }) {
  if (platform !== "darwin") {
    return electronBinary;
  }
  const marker = `${path.sep}Contents${path.sep}MacOS${path.sep}`;
  const markerAt = electronBinary.lastIndexOf(marker);
  if (markerAt < 0) {
    return electronBinary;
  }

  const sourceApp = electronBinary.slice(0, markerAt);
  const brandedApp = path.join(cacheDir, `${DEV_APP_NAME}.app`);
  const sourcePlist = path.join(sourceApp, "Contents", "Info.plist");
  const brandedPlist = path.join(brandedApp, "Contents", "Info.plist");

  const sourceVersion = readPlistString(sourcePlist, "CFBundleVersion");
  const upToDate =
    sourceVersion !== null &&
    readPlistString(brandedPlist, "CFBundleVersion") === sourceVersion &&
    readPlistString(brandedPlist, "CFBundleDisplayName") === DEV_APP_NAME;

  if (!upToDate) {
    rmSync(brandedApp, { recursive: true, force: true });
    mkdirSync(cacheDir, { recursive: true });
    try {
      execFileSync("cp", ["-cR", sourceApp, brandedApp]);
    } catch {
      rmSync(brandedApp, { recursive: true, force: true });
      execFileSync("cp", ["-R", sourceApp, brandedApp]);
    }
    // CFBundleDisplayName last: it is the marker of a finished copy.
    for (const key of ["CFBundleName", "CFBundleDisplayName"]) {
      execFileSync("plutil", ["-replace", key, "-string", DEV_APP_NAME, brandedPlist]);
    }
  }

  return path.join(brandedApp, "Contents", "MacOS", path.basename(electronBinary));
}

function readPlistString(plistPath, key) {
  try {
    return execFileSync("plutil", ["-extract", key, "raw", "-o", "-", plistPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}
