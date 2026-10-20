// Added for Groupon Desk (fork of Paseo, Apache-2.0): the { G } mark's measures.
import { describe, expect, it } from "vitest";
import { GROUPON_MARK_MASK_SVG, grouponMarkHeight } from "./groupon-mark";

describe("the { G } mark", () => {
  it("keeps the icon's proportions and masks as a black-only document", () => {
    expect(grouponMarkHeight(660)).toBe(436);
    expect(grouponMarkHeight(96)).toBe(63);
    expect(GROUPON_MARK_MASK_SVG).toContain("viewBox='182 294 660 436'");
    expect(GROUPON_MARK_MASK_SVG).not.toMatch(/0 0 700 700/);
  });
});
