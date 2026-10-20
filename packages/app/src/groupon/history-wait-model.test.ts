// Added for Groupon Desk (fork of Paseo, Apache-2.0): History waits for a Mac and reads again when one comes online.
import { describe, expect, it } from "vitest";
import { historyWaitingForMac, newlyOnline, shouldRereadHistory } from "./history-wait-model";

describe("newlyOnline", () => {
  it("names the Macs that came online", () => {
    expect(newlyOnline("", "srv_a")).toEqual(["srv_a"]);
    expect(newlyOnline("srv_a", "srv_a,srv_b")).toEqual(["srv_b"]);
  });

  it("names none when a Mac drops or nothing changed", () => {
    expect(newlyOnline("srv_a,srv_b", "srv_a")).toEqual([]);
    expect(newlyOnline("srv_a", "srv_a")).toEqual([]);
    expect(newlyOnline("", "")).toEqual([]);
  });
});

describe("historyWaitingForMac", () => {
  it("waits while no Mac is known yet (the hub has not been read)", () => {
    expect(historyWaitingForMac({ scopeServerIds: [], online: "" })).toBe(true);
  });

  it("waits while every Mac in scope is offline, the state that said Could not load history", () => {
    expect(historyWaitingForMac({ scopeServerIds: ["srv_mini"], online: "" })).toBe(true);
    expect(historyWaitingForMac({ scopeServerIds: ["srv_mini"], online: "srv_other" })).toBe(true);
  });

  it("stops waiting once one Mac in scope is online", () => {
    expect(
      historyWaitingForMac({ scopeServerIds: ["srv_air", "srv_mini"], online: "srv_mini" }),
    ).toBe(false);
  });
});

describe("shouldRereadHistory", () => {
  it("reads again when a Mac comes online after the screen opened", () => {
    expect(shouldRereadHistory({ previousOnline: "", online: "srv_mini", busy: false })).toBe(true);
  });

  it("leaves a running read alone", () => {
    expect(shouldRereadHistory({ previousOnline: "", online: "srv_mini", busy: true })).toBe(false);
  });

  it("does not read again when a Mac drops or nothing changed", () => {
    expect(
      shouldRereadHistory({ previousOnline: "srv_a,srv_b", online: "srv_a", busy: false }),
    ).toBe(false);
    expect(shouldRereadHistory({ previousOnline: "srv_a", online: "srv_a", busy: false })).toBe(
      false,
    );
  });
});
