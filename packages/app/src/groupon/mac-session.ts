// Added for Groupon Desk (fork of Paseo, Apache-2.0): this Mac's Groupon sign-in, as the desktop window gets it.

/**
 * The sign-in Groupon Desk and the `groupon` CLI hold on this Mac, lent to the packaged window by
 * its main process (`packages/desktop/src/features/groupon-desk-session.ts`, the preload's
 * `window.grouponDesk.readDeskSession`): production only, an access token already renewed there
 * when it was about to lapse.
 *
 * Constraints:
 * - Only the Electron window has the bridge; the web build and the phone answer null and keep
 *   their own sign-in
 * - The window never renews this session itself and never keeps it in its storage: Core rotates
 *   the refresh token on every renewal, so a second holder renewing it would sign the whole Mac
 *   out. When the token is about to lapse the window asks the bridge again
 */

export interface MacSession {
  accessToken: string;
  accessExpiresAt: string;
}

interface GrouponDeskBridge {
  readDeskSession?: () => Promise<unknown>;
}

declare global {
  interface Window {
    grouponDesk?: GrouponDeskBridge;
  }
}

function bridge(): GrouponDeskBridge | null {
  if (typeof window === "undefined") return null;
  const found = window.grouponDesk;
  return found && typeof found.readDeskSession === "function" ? found : null;
}

/** This Mac's production sign-in, or null when there is no bridge or the Mac has none. */
export async function readMacSession(): Promise<MacSession | null> {
  const desk = bridge();
  if (!desk?.readDeskSession) return null;
  let answer: unknown;
  try {
    answer = await desk.readDeskSession();
  } catch {
    return null;
  }
  if (typeof answer !== "object" || answer === null) return null;
  const { accessToken, accessExpiresAt } = answer as Record<string, unknown>;
  if (typeof accessToken !== "string" || accessToken === "") return null;
  if (typeof accessExpiresAt !== "string") return null;
  return { accessToken, accessExpiresAt };
}
