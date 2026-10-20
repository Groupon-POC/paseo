// Added for Groupon Desk (fork of Paseo, Apache-2.0): where Settings > Groupon says the vault key is kept, per runtime.

/**
 * The desktop window renders with React Native Web, so `isWeb` is true there too, and Settings
 * once told the window "Kept in this browser ... clearing this site's data". The window keeps the
 * key in its own storage and, when it has none, reads it from this Mac's login keychain as it
 * opens (`mac-session.ts`, `readDeskVaultKey`), so it says that; the browser keeps its sentence.
 */

import { GROUPON_SETTINGS } from "./strings";

export type VaultRuntime = "electron" | "web" | "native";

export function vaultRuntime(input: { isElectron: boolean; isWeb: boolean }): VaultRuntime {
  if (input.isElectron) return "electron";
  return input.isWeb ? "web" : "native";
}

export function vaultHint(
  runtime: VaultRuntime,
  lastUnlock: { ms: number; iterations: number; engine: string } | null,
): string {
  if (lastUnlock) {
    return GROUPON_SETTINGS.vaultMeasured(
      lastUnlock.ms,
      lastUnlock.iterations,
      lastUnlock.engine,
      runtime,
    );
  }
  if (runtime === "electron") return GROUPON_SETTINGS.vaultKeptWindow;
  return runtime === "web" ? GROUPON_SETTINGS.vaultKeptWeb : GROUPON_SETTINGS.vaultKept;
}
