// Added for Groupon Desk (fork of Paseo, Apache-2.0).
import { describe, expect, it } from "vitest";
import { readSealedPairing } from "./sealed-pairing";

const OFFER = "https://app.paseo.sh/#offer=eyJ2IjoyfQ";

describe("readSealedPairing", () => {
  it("reads the offer and the daemon's password a current hand seals", () => {
    expect(readSealedPairing(JSON.stringify({ v: 1, offerUrl: OFFER, password: "pw-1" }))).toEqual({
      offerUrl: OFFER,
      password: "pw-1",
    });
  });

  it("reads an older hand's bare offer URL with no password", () => {
    expect(readSealedPairing(OFFER)).toEqual({ offerUrl: OFFER, password: null });
  });

  it("answers null for JSON it cannot read", () => {
    expect(readSealedPairing("{broken")).toBeNull();
    expect(readSealedPairing(JSON.stringify({ v: 2, offerUrl: OFFER }))).toBeNull();
    expect(readSealedPairing(JSON.stringify({ v: 1 }))).toBeNull();
  });
});
