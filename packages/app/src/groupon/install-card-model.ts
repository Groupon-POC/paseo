// Added for Groupon Desk (fork of Paseo, Apache-2.0): when the "Add to your home screen" card is shown, and which one.

/**
 * The web build is an installable app (`public/manifest.json`, the head tags in `public/index.html`).
 * A phone's browser does not say so by itself, so a small card does: on iOS Safari the three steps
 * (iOS has no install prompt), on Android Chrome a real Install button once the browser has offered
 * the install (`beforeinstallprompt`). Installed, the browser keeps the site's storage, where Safari
 * deletes a site's data after seven days without a visit, so the card says it keeps the person signed in.
 *
 * Responsibilities:
 * - `installCard`: which card, if any, for this browser; pure, takes what the browser reported
 * - `readBrowser`: the report itself, from `window`; the only part that touches it
 *
 * Constraints:
 * - Nothing in the Electron window, a phone app or a desktop browser (a Mac browser has no home screen)
 * - Never shown once installed: `navigator.standalone` (iOS) or `display-mode: standalone`
 */

export type InstallCardKind = "ios" | "install";

/** What the browser reports; `promptAvailable` is a `beforeinstallprompt` event held and not yet used. */
export interface InstallBrowser {
  isWeb: boolean;
  isElectron: boolean;
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  /** Launched from the home screen: `navigator.standalone` or `display-mode: standalone`. */
  standalone: boolean;
  promptAvailable: boolean;
}

/** Another iOS browser's own menu differs from Safari's, so only Safari gets the three steps. */
const IOS_OTHER_BROWSERS = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo/;

export function isIosSafari(browser: InstallBrowser): boolean {
  const phone = /iPhone|iPad|iPod/.test(browser.userAgent);
  // An iPad asks for the desktop site and calls itself a Mac with a touch screen.
  const desktopClassIpad = browser.platform === "MacIntel" && browser.maxTouchPoints > 1;
  return (phone || desktopClassIpad) && !IOS_OTHER_BROWSERS.test(browser.userAgent);
}

export function isAndroid(browser: InstallBrowser): boolean {
  return /Android/.test(browser.userAgent);
}

/**
 * The card to show, or null. `dismissed` is the person's "Not now" on this device; Settings passes
 * false so the guide stays reachable there.
 */
export function installCard(browser: InstallBrowser, dismissed: boolean): InstallCardKind | null {
  if (!browser.isWeb || browser.isElectron || browser.standalone || dismissed) return null;
  if (isIosSafari(browser)) return "ios";
  if (isAndroid(browser) && browser.promptAvailable) return "install";
  return null;
}

/** True when this page was launched from the home screen, not from a browser tab. */
export function launchedStandalone(win: Window | undefined): boolean {
  if (!win) return false;
  const iosStandalone = (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const displayMode = win.matchMedia?.("(display-mode: standalone)")?.matches === true;
  return iosStandalone || displayMode;
}

export function readBrowser(
  win: Window | undefined,
  facts: { isWeb: boolean; isElectron: boolean; promptAvailable: boolean },
): InstallBrowser {
  return {
    ...facts,
    userAgent: win?.navigator.userAgent ?? "",
    platform: win?.navigator.platform ?? "",
    maxTouchPoints: win?.navigator.maxTouchPoints ?? 0,
    standalone: launchedStandalone(win),
  };
}
