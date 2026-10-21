// Added for Groupon Desk (fork of Paseo, Apache-2.0): the add-to-home-screen card's model.
import { describe, expect, it } from "vitest";
import { installCard, launchedStandalone, type InstallBrowser } from "./install-card-model";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

function browser(overrides: Partial<InstallBrowser>): InstallBrowser {
  return {
    isWeb: true,
    isElectron: false,
    userAgent: IPHONE_SAFARI,
    platform: "iPhone",
    maxTouchPoints: 5,
    standalone: false,
    promptAvailable: false,
    ...overrides,
  };
}

describe("installCard", () => {
  it("shows the three steps on iOS Safari when not installed", () => {
    expect(installCard(browser({}), false)).toBe("ios");
  });

  it("shows them on an iPad that asks for the desktop site", () => {
    expect(
      installCard(
        browser({ userAgent: MAC_CHROME.replace("Chrome/130.0 ", ""), platform: "MacIntel" }),
        false,
      ),
    ).toBe("ios");
  });

  it("hides once launched from the home screen", () => {
    expect(installCard(browser({ standalone: true }), false)).toBeNull();
    expect(
      installCard(
        browser({ userAgent: ANDROID_CHROME, standalone: true, promptAvailable: true }),
        false,
      ),
    ).toBeNull();
  });

  it("hides once dismissed on this device, and Settings ignores that", () => {
    expect(installCard(browser({}), true)).toBeNull();
    expect(installCard(browser({}), false)).toBe("ios");
  });

  it("offers Install on Android Chrome only once the browser has offered the install", () => {
    const android = { userAgent: ANDROID_CHROME, platform: "Linux armv8l" };
    expect(installCard(browser({ ...android, promptAvailable: true }), false)).toBe("install");
    expect(installCard(browser(android), false)).toBeNull();
  });

  it("shows nothing in the Electron window, a phone app or a Mac browser", () => {
    expect(installCard(browser({ isElectron: true }), false)).toBeNull();
    expect(installCard(browser({ isWeb: false }), false)).toBeNull();
    expect(
      installCard(
        browser({
          userAgent: MAC_CHROME,
          platform: "MacIntel",
          maxTouchPoints: 0,
          promptAvailable: true,
        }),
        false,
      ),
    ).toBeNull();
  });

  it("leaves another iOS browser to its own menu", () => {
    expect(installCard(browser({ userAgent: IPHONE_CHROME }), false)).toBeNull();
  });
});

describe("launchedStandalone", () => {
  const win = (standalone: boolean | undefined, displayMode: boolean) =>
    ({
      navigator: { standalone },
      matchMedia: (query: string) => ({ matches: displayMode && query.includes("standalone") }),
    }) as unknown as Window;

  it("is true for iOS's navigator.standalone and for display-mode: standalone", () => {
    expect(launchedStandalone(win(true, false))).toBe(true);
    expect(launchedStandalone(win(undefined, true))).toBe(true);
  });

  it("is false in a browser tab and without a window", () => {
    expect(launchedStandalone(win(false, false))).toBe(false);
    expect(launchedStandalone(win(undefined, false))).toBe(false);
    expect(launchedStandalone(undefined)).toBe(false);
  });
});
