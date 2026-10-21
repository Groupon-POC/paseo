// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for the popover placement rule.

/**
 * Tests for where a desktop popover opens.
 *
 * Covers: groupon/popover-placement.ts
 */

import { describe, expect, it } from "vitest";
import { resolvePopoverPlacement } from "./popover-placement";

const BASE = { anchorHeight: 28, windowHeight: 800, padding: 8, offset: 5 };

describe("resolvePopoverPlacement", () => {
  it("opens downward when the trigger sits in the upper half (New workspace at 1200 by 800)", () => {
    const placement = resolvePopoverPlacement({ ...BASE, anchorTop: 212, contentHeight: 420 });
    expect(placement.side).toBe("bottom");
    expect(placement.maxHeight).toBe(420);
  });

  it("opens upward when the trigger sits in the lower half (the chat composer)", () => {
    const placement = resolvePopoverPlacement({ ...BASE, anchorTop: 700, contentHeight: 420 });
    expect(placement.side).toBe("top");
    expect(placement.maxHeight).toBe(420);
  });

  it("caps the height to the room on the side it opens, so the list scrolls", () => {
    const placement = resolvePopoverPlacement({ ...BASE, anchorTop: 450, contentHeight: 600 });
    // Lower half, upward: 450 - 5 - 8 = 437 above, 800 - 478 - 13 = 309 below.
    expect(placement).toEqual({ side: "top", maxHeight: 437 });
  });

  it("keeps the side by half and caps the height in a short window", () => {
    const short = resolvePopoverPlacement({
      ...BASE,
      windowHeight: 300,
      anchorTop: 20,
      contentHeight: 420,
    });
    // Upper half, downward: 300 - 48 - 13 = 239 below.
    expect(short).toEqual({ side: "bottom", maxHeight: 239 });
  });

  it("never lets the popover leave the window on either side", () => {
    for (const anchorTop of [0, 40, 212, 390, 410, 600, 772]) {
      for (const contentHeight of [120, 420, 900]) {
        const { side, maxHeight } = resolvePopoverPlacement({
          ...BASE,
          anchorTop,
          contentHeight,
        });
        const edge = side === "top" ? anchorTop - 5 - maxHeight : anchorTop + 28 + 5 + maxHeight;
        if (side === "top") expect(edge).toBeGreaterThanOrEqual(8);
        else expect(edge).toBeLessThanOrEqual(800 - 8);
        expect(maxHeight).toBeGreaterThanOrEqual(0);
        expect(maxHeight).toBeLessThanOrEqual(contentHeight);
      }
    }
  });
});
