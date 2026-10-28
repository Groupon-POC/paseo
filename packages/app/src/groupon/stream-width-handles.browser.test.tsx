// Added for Groupon Desk (fork of Paseo, Apache-2.0): the agent output's width handles in a real browser: guides while dragging, one share kept on release.

/**
 * Tests for the agent output's edge handles.
 *
 * Covers: packages/app/src/groupon/stream-width-handles.web.tsx
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreamWidthHandles } from "./stream-width-handles.web";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("React", React);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function renderHandles(onCommit: (share: number | null) => void) {
  host = document.createElement("div");
  host.style.cssText = "position:fixed;left:0;top:0;width:1600px;height:700px;";
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      <StreamWidthHandles
        paneWidth={1600}
        streamWidth={820}
        contentMaxWidth={820}
        onCommit={onCommit}
      />,
    ),
  );
}

function handle(side: "left" | "right"): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-testid="stream-width-handle-${side}"]`)!;
}

function pointer(target: EventTarget, type: string, clientX: number) {
  act(() => {
    target.dispatchEvent(
      new PointerEvent(type, { clientX, clientY: 300, button: 0, bubbles: true }),
    );
  });
}

describe("the agent output's width handles", () => {
  it("sit just outside the output's edges, centred in the pane", () => {
    renderHandles(vi.fn());
    const left = handle("left").getBoundingClientRect();
    const right = handle("right").getBoundingClientRect();

    // The 820px output's text spans 398-1202; each handle sits 14px outside it.
    expect(Math.round(left.left + left.width / 2)).toBe(384);
    expect(Math.round(right.left + right.width / 2)).toBe(1216);
  });

  it("draws guides while dragged and keeps the share only once let go", () => {
    const onCommit = vi.fn();
    renderHandles(onCommit);

    pointer(handle("right"), "pointerdown", 1216);
    pointer(window, "pointermove", 1416);
    const guides = document.querySelectorAll<HTMLElement>('[data-testid="stream-width-guide"]');

    expect(guides).toHaveLength(2);
    // Both edges moved 200px apart from the middle: 1220px wide, its text 1204px.
    expect(Math.round(guides[1]!.getBoundingClientRect().left)).toBe(1402);
    expect(onCommit).not.toHaveBeenCalled();

    pointer(window, "pointerup", 1416);

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0]?.[0]).toBeCloseTo(1220 / 1600, 5);
    expect(document.querySelectorAll('[data-testid="stream-width-guide"]')).toHaveLength(0);
  });

  it("keeps nothing on Escape, and returns to the content width on a double click", () => {
    const onCommit = vi.fn();
    renderHandles(onCommit);

    pointer(handle("left"), "pointerdown", 384);
    pointer(window, "pointermove", 200);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    pointer(window, "pointerup", 200);
    expect(onCommit).not.toHaveBeenCalled();

    act(() => {
      handle("left").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(onCommit).toHaveBeenCalledWith(null);
  });
});
