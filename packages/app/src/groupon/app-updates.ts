// Added for Groupon Desk (fork of Paseo, Apache-2.0): Paseo's own app updates are not offered: the work window updates with Groupon Desk.

/**
 * The work window is nested inside Groupon Desk (`Contents/Helpers/Groupon Desk Work.app`) and
 * never checks Paseo's update feed (`packages/desktop/src/features/auto-updater.ts`): Groupon
 * Desk's own update replaces both. Off: Settings > About shows no release channel (Stable / Beta)
 * and no Check / Update, only that updates arrive with Groupon Desk, and the sidebar's update
 * callout is not mounted. Paseo's code for them stays, so a rebase stays small.
 */
export const PASEO_APP_UPDATES = false;

/** Whether the window offers Paseo's release channel and its Check / Update controls. */
export function showsPaseoAppUpdates(isDesktopApp: boolean): boolean {
  return PASEO_APP_UPDATES && isDesktopApp;
}
