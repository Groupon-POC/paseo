// Added for Groupon Desk (fork of Paseo, Apache-2.0): Live's failed-calls switch in the composer's display menu, in a real browser.

/**
 * Tests for the chat display mode menu.
 *
 * Covers: packages/app/src/groupon/chat-display-mode-control.tsx
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const settings = { chatDisplayMode: "live", liveShowsFailedTools: true };
const updateSettings = vi.fn(async () => {});
vi.mock("@/hooks/use-settings", () => ({
  useAppSettings: () => ({ settings, updateSettings }),
}));

const { ChatDisplayModeControl } = await import("./chat-display-mode-control");

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("React", React);
  updateSettings.mockClear();
  host = document.createElement("div");
  host.style.cssText = "position:fixed;left:40px;bottom:40px;width:600px;";
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe("the chat display menu", () => {
  it("turns Live's failed calls off from the warning sign without picking the row", () => {
    act(() => root?.render(<ChatDisplayModeControl />));
    act(() => byTestId("composer-chat-display-mode")?.click());

    const sign = byTestId("chat-display-live-failed");
    expect(sign?.getAttribute("aria-label")).toBe("Hide failed tool calls in Live");
    act(() => sign?.click());

    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(updateSettings).toHaveBeenCalledWith({ liveShowsFailedTools: false });
    // The menu stays open: the press never reached the row.
    expect(byTestId("chat-display-mode-live")).not.toBeNull();
  });

  it("draws the warning sign only beside Live", () => {
    act(() => root?.render(<ChatDisplayModeControl />));
    act(() => byTestId("composer-chat-display-mode")?.click());

    expect(
      byTestId("chat-display-mode-live")?.querySelector('[data-testid="chat-display-live-failed"]'),
    ).not.toBeNull();
    expect(
      byTestId("chat-display-mode-all")?.querySelector('[data-testid="chat-display-live-failed"]'),
    ).toBeNull();
  });
});
