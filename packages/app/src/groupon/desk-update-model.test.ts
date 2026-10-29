// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for the sidebar's update row.
import { describe, expect, it } from "vitest";
import type { DeskUpdateAnswer } from "./desk-plugin-rpc";
import { deskUpdateWhat } from "./desk-update-model";

const answer = (desk: boolean, cli: boolean): DeskUpdateAnswer => ({
  desk: { installed: "2.0.8599", latest: "2.0.8601", updateAvailable: desk },
  cli: { installed: "2.0.8599", latest: "2.0.8602", updateAvailable: cli },
  problem: null,
  install: null,
});

describe("the sidebar's update row", () => {
  it("names what is newer on the shelf", () => {
    expect(deskUpdateWhat(answer(true, true))).toBe("Groupon Desk 2.0.8601 and the command line 2.0.8602");
    expect(deskUpdateWhat(answer(false, true))).toBe("the command line 2.0.8602");
  });

  it("shows nothing when both are current or nothing was read", () => {
    expect(deskUpdateWhat(answer(false, false))).toBeNull();
    expect(deskUpdateWhat(null)).toBeNull();
  });
});
