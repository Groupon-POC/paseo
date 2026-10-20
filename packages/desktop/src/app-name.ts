// Added for Groupon Desk (fork of Paseo, Apache-2.0): the app's name, set before anything reads it, and the folder its state keeps.
import path from "node:path";
import { app } from "electron";

// The packaged app is Groupon Desk's work window, nested in the menu-bar app as
// "Groupon Desk Work.app": the menu bar's application menu, the About panel, the window title and
// the notifications' sender say "Groupon Desk Work" (owner, 2026-10-20). A development run says
// "Groupon Desk DEV". The Dock and the bold menu title of a development run come from the Electron
// bundle's Info.plist instead, which scripts/dev-runner.mjs brands the same way.
export const APP_NAME =
  process.env.PASEO_TEST_APP_NAME?.trim() ||
  (app.isPackaged ? "Groupon Desk Work" : "Groupon Desk DEV");

// The state a packaged app keeps (the window's storage, the hosts it knows, its settings) stays in
// the folder the earlier name gave it, "Groupon Desk", so a person keeps it across the rename.
// A test name and a development run keep Electron's own choice, which follows the name.
const STATE_FOLDER_NAME = "Groupon Desk";

app.setName(APP_NAME);
if (app.isPackaged && !process.env.PASEO_TEST_APP_NAME?.trim()) {
  app.setPath("userData", path.join(app.getPath("appData"), STATE_FOLDER_NAME));
}
