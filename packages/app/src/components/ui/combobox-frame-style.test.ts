// Changed for Groupon Desk (fork of Paseo, Apache-2.0): the fixed-height popover shrinks to its room.
import type { ViewStyle } from "react-native";
import { describe, expect, it } from "vitest";

import { buildDesktopFrameStyle } from "./combobox-frame-style";

function buildWidthStyle(input: {
  desktopMinWidth?: number;
  referenceWidth: number | null;
}): Pick<ViewStyle, "width" | "minWidth" | "maxWidth"> {
  const [frameStyle] = buildDesktopFrameStyle({
    desktopMinWidth: input.desktopMinWidth,
    desktopLockWidth: false,
    referenceWidth: input.referenceWidth,
    desktopFixedHeight: undefined,
    desktopPositionStyle: { left: 0, top: 0 },
    shouldHideDesktopContent: false,
    availableHeight: undefined,
  }) as ViewStyle[];

  return {
    width: frameStyle.width,
    minWidth: frameStyle.minWidth,
    maxWidth: frameStyle.maxWidth,
  };
}

describe("buildDesktopFrameStyle", () => {
  it("lets a narrow trigger grow to the default desktop ceiling", () => {
    expect(buildWidthStyle({ referenceWidth: 120 })).toEqual({
      width: undefined,
      minWidth: 120,
      maxWidth: 400,
    });
  });

  it("keeps a wide trigger from being capped below its own width", () => {
    expect(buildWidthStyle({ referenceWidth: 470 })).toEqual({
      width: undefined,
      minWidth: 470,
      maxWidth: 470,
    });
  });

  it("uses desktopMinWidth as an explicit floor raiser", () => {
    expect(buildWidthStyle({ desktopMinWidth: 360, referenceWidth: 120 })).toEqual({
      width: undefined,
      minWidth: 360,
      maxWidth: 400,
    });
  });

  it("keeps the trigger as the floor when it is wider than desktopMinWidth", () => {
    expect(buildWidthStyle({ desktopMinWidth: 240, referenceWidth: 300 })).toEqual({
      width: undefined,
      minWidth: 300,
      maxWidth: 400,
    });
  });

  it("locks the frame to its opening floor when content must not resize it", () => {
    const [frameStyle] = buildDesktopFrameStyle({
      desktopMinWidth: 360,
      desktopLockWidth: true,
      referenceWidth: 120,
      desktopFixedHeight: undefined,
      desktopPositionStyle: { left: 0, top: 0 },
      shouldHideDesktopContent: false,
      availableHeight: undefined,
    }) as ViewStyle[];

    expect(frameStyle).toMatchObject({ width: 360, minWidth: 360, maxWidth: 360 });
  });

  it("shrinks a fixed-height frame to the room it has, so its list scrolls", () => {
    const style = buildDesktopFrameStyle({
      desktopMinWidth: undefined,
      desktopLockWidth: false,
      referenceWidth: 120,
      desktopFixedHeight: 420,
      desktopPositionStyle: { left: 0, top: 0 },
      shouldHideDesktopContent: false,
      availableHeight: 250,
    }) as ViewStyle[];
    const merged = Object.assign({}, ...style.filter(Boolean));

    expect(merged).toMatchObject({ minHeight: 250, maxHeight: 250 });
  });

  it("keeps a fixed-height frame at its height when there is room", () => {
    const style = buildDesktopFrameStyle({
      desktopMinWidth: undefined,
      desktopLockWidth: false,
      referenceWidth: 120,
      desktopFixedHeight: 300,
      desktopPositionStyle: { left: 0, top: 0 },
      shouldHideDesktopContent: false,
      availableHeight: 500,
    }) as ViewStyle[];
    const merged = Object.assign({}, ...style.filter(Boolean));

    expect(merged).toMatchObject({ minHeight: 300, maxHeight: 300 });
  });
});
