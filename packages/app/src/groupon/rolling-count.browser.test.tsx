// Added for Groupon Desk (fork of Paseo, Apache-2.0): the rolling count in a real browser.

/**
 * Tests for the count that rolls to its new value.
 *
 * Covers: packages/app/src/groupon/rolling-count.web.tsx
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RollingCount } from "./rolling-count.web";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("React", React);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const rolling = () => host?.querySelector('[data-testid="rolling-count"]') ?? null;

describe("a count that rolls to its new value", () => {
  it("does not roll at first, rolls only the digits that changed, then rests on the new text", async () => {
    act(() => root?.render(<RollingCount text="9" />));
    expect(rolling()).toBeNull();
    expect(host?.textContent).toBe("9");

    act(() => root?.render(<RollingCount text="10" />));
    const slots = [...(rolling()?.children ?? [])].filter((child) => child.tagName === "SPAN");
    // Both places changed: " " to "1" and "9" to "0", each with the new and the old character.
    expect(slots.map((slot) => slot.textContent)).toEqual(["1", "09"]);
    const incoming = slots[1]?.firstElementChild as HTMLElement;
    expect(incoming.style.animation).toContain("groupon-roll-in-up");

    act(() => root?.render(<RollingCount text="10" />));
    await act(() => new Promise((resolve) => setTimeout(resolve, 450)));
    expect(rolling()).toBeNull();
    expect(host?.textContent).toBe("10");
  });

  it("rolls down when the count shrinks", () => {
    act(() => root?.render(<RollingCount text="12" />));
    act(() => root?.render(<RollingCount text="11" />));
    const changed = [...(rolling()?.children ?? [])].find((child) => child.textContent === "12");
    const incoming = changed?.firstElementChild as HTMLElement | null | undefined;
    expect(incoming?.style.animation).toContain("groupon-roll-in-down");
  });
});
