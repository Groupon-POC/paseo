// Added for Groupon Desk (fork of Paseo, Apache-2.0): the app's name, set before anything reads it.
import { app } from "electron";

// A development run says so in the menu bar's application menu, the About panel and the window
// title. The Dock and the bold menu title of a development run come from the Electron bundle's
// Info.plist instead, which scripts/dev-runner.mjs brands the same way.
export const APP_NAME =
  process.env.PASEO_TEST_APP_NAME?.trim() || (app.isPackaged ? "Groupon Desk" : "Groupon Desk DEV");

app.setName(APP_NAME);
