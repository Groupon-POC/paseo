// Changed for Groupon Desk (fork of Paseo, Apache-2.0): two replies next to each other sit a short gap apart.
import { describe, expect, it } from "vitest";
import { getAssistantMessageSpacing, getGapBetweenStreamItems } from "./spacing";
import type { StreamItem } from "@/types/stream";
const message: StreamItem = {
  kind: "assistant_message",
  id: "m",
  text: "First\n\nSecond",
  timestamp: new Date(0),
};
describe("whole-message spacing", () => {
  it("compacts only the gap to its turn footer", () => {
    expect(getAssistantMessageSpacing({ item: message })).toBe("default");
    expect(getAssistantMessageSpacing({ item: message, hasFooterBelow: true })).toBe(
      "compactBottom",
    );
  });
  it("keeps separate messages separated", () => {
    expect(getGapBetweenStreamItems(message, { ...message, id: "next" })).toBeGreaterThan(0);
  });
  it("sets two replies next to each other 16 px apart: no bottom padding above, a 4 px gap, 12 px of top padding", () => {
    const next: StreamItem = { ...message, id: "next" };

    expect(getAssistantMessageSpacing({ item: message, belowItem: next })).toBe("compactBottom");
    expect(getGapBetweenStreamItems(message, next)).toBe(4);
  });
});
