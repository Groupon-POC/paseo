// Added for Groupon Desk (fork of Paseo, Apache-2.0): a tooltip never hangs over another tab once its trigger is gone.

/**
 * Tests for the tooltip closing when its panel hides or the pointer is elsewhere.
 *
 * Covers: packages/app/src/components/ui/tooltip.tsx
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Text } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RetainedPanelActivity } from "@/components/retained-panel";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("React", React);
  host = document.createElement("div");
  host.style.cssText = "position:fixed;left:0;top:0;width:400px;height:300px;";
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

function Chat({ active }: { active: boolean }) {
  return (
    <RetainedPanelActivity active={active}>
      <Tooltip defaultOpen>
        <TooltipTrigger testID="trigger">
          <Text>Share</Text>
        </TooltipTrigger>
        <TooltipContent testID="tip">
          <Text>Share this workspace</Text>
        </TooltipContent>
      </Tooltip>
    </RetainedPanelActivity>
  );
}

const tip = () => document.querySelector('[data-testid="tip"]');

describe("a tooltip whose trigger is gone", () => {
  it("closes when its panel is hidden, as when a link opened another tab", () => {
    act(() => root?.render(<Chat active />));
    expect(tip()).not.toBeNull();

    act(() => root?.render(<Chat active={false} />));
    expect(tip()).toBeNull();

    act(() => root?.render(<Chat active />));
    expect(tip()).toBeNull();
  });

  it("closes once the pointer moves anywhere but over its trigger", async () => {
    act(() => root?.render(<Chat active />));
    const trigger = document.querySelector<HTMLElement>('[data-testid="trigger"]')!;
    const box = trigger.getBoundingClientRect();

    act(() => {
      document.dispatchEvent(
        new PointerEvent("pointermove", { clientX: box.left + 1, clientY: box.top + 1 }),
      );
    });
    expect(tip()).not.toBeNull();

    act(() => {
      document.dispatchEvent(new PointerEvent("pointermove", { clientX: 390, clientY: 290 }));
    });
    // The tooltip fades out over 80 ms before it leaves the page.
    await act(() => new Promise((resolve) => setTimeout(resolve, 250)));
    expect(tip()).toBeNull();
  });
});
