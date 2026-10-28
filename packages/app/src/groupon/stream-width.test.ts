// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for the agent output's width as a share of its pane.

import { describe, expect, it } from "vitest";
import { canWidenStream, resolveStreamMaxWidth, shareForStreamWidth } from "./stream-width";

describe("the agent output's width", () => {
  it("keeps the content width until a share is kept, then takes that share of each pane in steps", () => {
    expect(resolveStreamMaxWidth({ share: null, paneWidth: 2000, contentMaxWidth: 820 })).toBe(820);
    expect(resolveStreamMaxWidth({ share: 0.6, paneWidth: 2000, contentMaxWidth: 820 })).toBe(1200);
    // 0.6 of 1700 is 1020, the nearest 16px step 1024.
    expect(resolveStreamMaxWidth({ share: 0.6, paneWidth: 1700, contentMaxWidth: 820 })).toBe(1024);
  });

  it("never goes below the content width nor past the pane less a tenth on each side", () => {
    expect(resolveStreamMaxWidth({ share: 0.3, paneWidth: 2000, contentMaxWidth: 820 })).toBe(820);
    expect(resolveStreamMaxWidth({ share: 0.8, paneWidth: 1000, contentMaxWidth: 820 })).toBe(820);
    expect(resolveStreamMaxWidth({ share: 0.79, paneWidth: 2000, contentMaxWidth: 820 })).toBe(
      1584,
    );
    expect(canWidenStream(1000, 820)).toBe(false);
    expect(canWidenStream(1400, 820)).toBe(true);
  });

  it("keeps no share once the output is dragged back to the content width", () => {
    expect(shareForStreamWidth(826, 2000, 820)).toBeNull();
    expect(shareForStreamWidth(1200, 2000, 820)).toBe(0.6);
    expect(shareForStreamWidth(1900, 2000, 820)).toBe(0.8);
  });

  it("keeps the text clear of the chat outline's rail, the content width included", () => {
    // The rail shows from a 918 px pane; the output leaves 56 px on each side for it.
    expect(resolveStreamMaxWidth({ share: null, paneWidth: 920, contentMaxWidth: 820 })).toBe(808);
    expect(resolveStreamMaxWidth({ share: null, paneWidth: 900, contentMaxWidth: 820 })).toBe(820);
    expect(resolveStreamMaxWidth({ share: null, paneWidth: 2000, contentMaxWidth: 1950 })).toBe(
      1888,
    );
    expect(resolveStreamMaxWidth({ share: 0.79, paneWidth: 1000, contentMaxWidth: 700 })).toBe(784);
  });
});
