// Changed for Groupon Desk (fork of Paseo, Apache-2.0): the hint names every source form, the registry page address among them.
import { describe, expect, it } from "vitest";
import { openPluginInstallForm, PLUGIN_SOURCE_HINT } from "./plugin-install-form-model";

describe("plugin install form", () => {
  it("keeps the edited source in the submission until explicitly reset", () => {
    const model = openPluginInstallForm();

    model.setSource("owner/review");

    expect(model.getSubmission()).toEqual({ source: "owner/review" });

    model.reset();
    expect(model.getState()).toEqual({
      source: "",
      canSubmit: false,
      resetKey: 1,
    });
  });

  it("trims the submitted source", () => {
    const model = openPluginInstallForm();
    model.setSource("  /plugins/review  ");
    expect(model.getSubmission()).toEqual({ source: "/plugins/review" });
  });

  it("names every source form in its hint, the registry page address among them", () => {
    for (const form of [
      "https://paseo.sh/plugins/owner/slug",
      "owner/slug",
      "github:owner/repo",
      "Git URL",
      "npm:package",
      "folder",
    ]) {
      expect(PLUGIN_SOURCE_HINT).toContain(form);
    }
  });
});
