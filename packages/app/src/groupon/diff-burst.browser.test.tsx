// Added for Groupon Desk (fork of Paseo, Apache-2.0): the diff pill's burst in a real browser.

/**
 * Tests for what a growing diff draws above its pill.
 *
 * Covers: packages/app/src/groupon/diff-burst.web.tsx
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiffBurst } from "./diff-burst.web";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("React", React);
  host = document.createElement("div");
  host.style.cssText = "position:fixed;left:200px;top:200px;";
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const burst = () => host?.querySelector('[data-testid="diff-burst"]') ?? null;
/** The burst's words, its keyframes left out. */
const burstText = () =>
  [...(burst()?.children ?? [])]
    .filter((child) => child.tagName !== "STYLE")
    .map((child) => child.textContent)
    .join("");
const show = (additions: number, deletions: number, scope = "ws-1") =>
  act(() => root?.render(<DiffBurst additions={additions} deletions={deletions} scope={scope} />));

describe("what a growing diff draws above its pill", () => {
  it("shows what the count grew by, and nothing on the first count", async () => {
    show(7400, 120);
    expect(burst()).toBeNull();

    show(7412, 123);
    expect(burstText()).toBe("+12-3");
    // Each burst starts a little off centre and leans a little, its own way.
    const words = [...(burst()?.children ?? [])].find((child) => child.tagName !== "STYLE");
    const style = (words as HTMLElement | undefined)?.style;
    expect(style?.getPropertyValue("--burst-x")).toMatch(/^-?\d+(\.\d)?px$/);
    expect(style?.getPropertyValue("--burst-tilt")).toMatch(/^-?\d+(\.\d)?deg$/);

    await act(() => new Promise((resolve) => setTimeout(resolve, 900)));
    expect(burst()).toBeNull();
  });

  it("shows nothing when the pill starts counting another workspace, or the count shrinks", () => {
    show(10, 0, "ws-1");
    show(500, 40, "ws-2");
    expect(burst()).toBeNull();
    show(450, 40, "ws-2");
    expect(burst()).toBeNull();
  });
});
