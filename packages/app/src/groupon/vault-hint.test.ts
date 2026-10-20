// Added for Groupon Desk (fork of Paseo, Apache-2.0): Settings > Groupon names where the vault key is kept.
import { describe, expect, it } from "vitest";
import { vaultHint, vaultRuntime } from "./vault-hint";

describe("vaultHint", () => {
  it("tells the desktop window it keeps the key and reads it from the Mac's keychain, never a browser", () => {
    const runtime = vaultRuntime({ isElectron: true, isWeb: true });
    expect(runtime).toBe("electron");
    const hint = vaultHint(runtime, null);
    expect(hint).toContain(
      "Kept in this window, read from this Mac's keychain when the window opens",
    );
    expect(hint).not.toContain("browser");
    expect(hint).not.toContain("site's data");
    expect(vaultHint(runtime, { ms: 812, iterations: 600_000, engine: "webcrypto" })).toContain(
      "kept in this window",
    );
  });

  it("keeps the browser's sentence on the web and the keychain's on a phone app", () => {
    expect(vaultHint(vaultRuntime({ isElectron: false, isWeb: true }), null)).toContain(
      "clearing this site's data",
    );
    expect(vaultHint(vaultRuntime({ isElectron: false, isWeb: false }), null)).toContain(
      "this device's keychain",
    );
    expect(vaultHint("web", { ms: 1200, iterations: 600_000, engine: "webcrypto" })).toContain(
      "kept in this browser, encrypted",
    );
  });
});
