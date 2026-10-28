// Added for Groupon Desk (fork of Paseo, Apache-2.0): the centered dock (New workspace) scrolls as a whole instead of cutting its setup fields off under a grown composer.

/**
 * Tests for the centered composer dock.
 *
 * Covers: packages/app/src/composer/dock/index.tsx
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/toast-host", () => ({
  useToastHost: () => ({ api: null, toast: null, dismiss: () => {} }),
  ToastViewport: () => null,
}));
vi.mock("@/contexts/toast-context", () => ({
  useToast: () => ({ show: () => () => {}, copied: () => {}, error: vi.fn() }),
  ToastApiProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const { ComposerDock } = await import("./index");

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("React", React);
  host = document.createElement("div");
  host.style.cssText = "position:fixed;left:0;top:0;width:900px;height:320px;display:flex;";
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const FILL = { display: "flex", flex: 1 } as const;
const SETUP_STYLE = { height: 160 } as const;
const COMPOSER_STYLE = { height: 260 } as const;
const SETUP = <div data-testid="setup" style={SETUP_STYLE} />;
const TALL_COMPOSER = <div data-testid="composer" style={COMPOSER_STYLE} />;

describe("the centered dock", () => {
  it("keeps the setup fields whole when the composer outgrows the room, and scrolls instead", async () => {
    act(() =>
      root?.render(
        <div style={FILL}>
          <ComposerDock centered>{[SETUP, TALL_COMPOSER]}</ComposerDock>
        </div>,
      ),
    );
    await act(async () => new Promise((done) => setTimeout(done, 50)));

    const setup = document.querySelector<HTMLElement>('[data-testid="setup"]')!;
    const composer = document.querySelector<HTMLElement>('[data-testid="composer"]')!;
    // The setup area is never squeezed under the composer.
    expect(setup.parentElement!.getBoundingClientRect().height).toBeGreaterThanOrEqual(160);
    expect(composer.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      setup.getBoundingClientRect().bottom - 1,
    );
  });

  it("keeps the form centred across the window's width", async () => {
    act(() =>
      root?.render(
        <div style={FILL}>
          <ComposerDock centered>{[SETUP, TALL_COMPOSER]}</ComposerDock>
        </div>,
      ),
    );
    await act(async () => new Promise((done) => setTimeout(done, 50)));

    const composer = document.querySelector<HTMLElement>('[data-testid="composer"]')!;
    const box = composer.parentElement!.parentElement!.getBoundingClientRect();
    const hostBox = host!.getBoundingClientRect();
    expect(Math.abs(box.left + box.width / 2 - (hostBox.left + hostBox.width / 2))).toBeLessThan(2);
    expect(box.width).toBeGreaterThan(400);
  });
});
