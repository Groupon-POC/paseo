// Added for Groupon Desk (fork of Paseo, Apache-2.0): a status icon keeps its size beside a long one-line text.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Text, View } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckPresentationIcon } from "./check-presentation.view";

// The project's stub renders nothing; on web the real icon is a bare <svg>, the flex item under test.
vi.mock("lucide-react-native", async () => {
  const { createElement } = await import("react");
  const SvgIcon = ({ size }: { size?: number }) =>
    createElement("svg", { width: size, height: size });
  return { CircleCheck: SvgIcon, CircleDot: SvgIcon, CircleSlash: SvgIcon, CircleX: SvgIcon };
});

beforeEach(() => vi.stubGlobal("React", React));

const mounted: { root: Root; container: HTMLDivElement }[] = [];

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
});

const ROW_STYLE = { flexDirection: "row", alignItems: "center", width: 240 } as const;
const TEXT_STYLE = { flexShrink: 1 } as const;

function renderRow(text: string): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  act(() => {
    root.render(
      <View style={ROW_STYLE}>
        <CheckPresentationIcon presentation="failure" size={12} />
        <Text style={TEXT_STYLE} numberOfLines={1}>
          {text}
        </Text>
      </View>,
    );
  });
  return container;
}

function iconWidth(container: HTMLDivElement): number {
  const icon = container.querySelector("svg");
  if (!icon) {
    throw new Error("The row renders no icon");
  }
  return icon.getBoundingClientRect().width;
}

describe("CheckPresentationIcon", () => {
  it("keeps its size however far the text beside it overflows", () => {
    expect(iconWidth(renderRow("Verdict: CHANGES REQUESTED."))).toBe(12);
    expect(iconWidth(renderRow("Verdict: CHANGES REQUESTED. ".repeat(40)))).toBe(12);
  });
});
