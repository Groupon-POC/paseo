// Added for Groupon Desk (fork of Paseo, Apache-2.0): the window offers no Paseo release channel or update.
import { describe, expect, it } from "vitest";
import { PASEO_APP_UPDATES, showsPaseoAppUpdates } from "./app-updates";
import { GROUPON_ABOUT } from "./strings";

describe("Paseo's app updates", () => {
  it("are off: no release channel and no Check / Update, in the desktop window or anywhere", () => {
    expect(PASEO_APP_UPDATES).toBe(false);
    expect(showsPaseoAppUpdates(true)).toBe(false);
    expect(showsPaseoAppUpdates(false)).toBe(false);
  });

  it("say where updates come from instead", () => {
    expect(GROUPON_ABOUT.updatesWithDesk).toBe("Updates arrive with Groupon Desk");
  });
});
