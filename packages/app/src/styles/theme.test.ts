// Changed for Groupon Desk (fork of Paseo, Apache-2.0): the Groupon dark theme leads the catalog and has its own expectations. Bearded Arc last in the picker.
import { describe, expect, it } from "vitest";
import {
  darkGrouponTheme,
  darkPureBlackTheme,
  darkTheme,
  FONT_SIZE,
  GROUPON_GREEN,
  GROUPON_GREEN_ON_DARK,
  getNextThemePreference,
  lightTheme,
  THEME_OPTIONS,
} from "./theme";

describe("Typography scale", () => {
  it("names 14px as the default interface tier", () => {
    expect(FONT_SIZE).toEqual({
      code: 12,
      content: 15,
      sm: 12,
      base: 14,
      lg: 16,
      xl: 18,
      "2xl": 20,
      "3xl": 22,
      "4xl": 26,
    });
  });
});

describe("Theme catalog", () => {
  it("owns the picker and shortcut order", () => {
    expect(THEME_OPTIONS.map((option) => option.name)).toEqual([
      "grouponDark",
      "light",
      "dark",
      "auto",
      "zinc",
      "midnight",
      "claude",
      "ghostty",
      "pureBlack",
      "beardedArc",
    ]);
    expect(getNextThemePreference("dark")).toBe("auto");
    expect(getNextThemePreference("pureBlack")).toBe("beardedArc");
    expect(getNextThemePreference("beardedArc")).toBe("grouponDark");
    expect(getNextThemePreference("grouponDark")).toBe("light");
  });
});

describe("Groupon dark theme", () => {
  it("keeps Paseo's dark surfaces", () => {
    expect(darkGrouponTheme.colorScheme).toBe("dark");
    expect(darkGrouponTheme.colors.surface0).toBe(darkTheme.colors.surface0);
    expect(darkGrouponTheme.colors.surfaceSidebar).toBe(darkTheme.colors.surfaceSidebar);
    expect(darkGrouponTheme.colors.foreground).toBe(darkTheme.colors.foreground);
  });

  it("uses the Groupon green as the accent, the lighter green for text on dark", () => {
    expect(darkGrouponTheme.colors.accent).toBe(GROUPON_GREEN);
    expect(darkGrouponTheme.colors.success).toBe(GROUPON_GREEN);
    expect(darkGrouponTheme.colors.accentForeground).toBe("#ffffff");
    expect(darkGrouponTheme.colors.accentBright).toBe(GROUPON_GREEN_ON_DARK);
  });

  it("tints the selected sidebar row green, apart from hover", () => {
    expect(darkGrouponTheme.colors.surfaceSidebarSelected).toBe("#1C2816");
    expect(darkGrouponTheme.colors.surfaceSidebarHover).toBe(darkGrouponTheme.colors.surface1);
  });
});

describe("Pure black theme", () => {
  it("uses a pure black application and terminal background", () => {
    expect(darkPureBlackTheme.colors.surface0).toBe("#000000");
    expect(darkPureBlackTheme.colors.background).toBe("#000000");
    expect(darkPureBlackTheme.colors.terminal.background).toBe("#000000");
  });

  it("uses Paseo's muted green accent", () => {
    expect(darkPureBlackTheme.colors.accent).toBe("#20744A");
    expect(darkPureBlackTheme.colors.accentBright).toBe("#7ccba0");
  });

  it("derives sidebar interaction surfaces from the surface scale", () => {
    expect(darkPureBlackTheme.colors.surfaceSidebar).toBe("#000000");
    expect(darkPureBlackTheme.colors.surfaceSidebarHover).toBe(darkPureBlackTheme.colors.surface1);
    expect(darkPureBlackTheme.colors.surfaceSidebarSelected).toBe(
      darkPureBlackTheme.colors.surface2,
    );
  });

  it("keeps ANSI black output readable on its zero-luminance terminal background", () => {
    expect(darkPureBlackTheme.colors.terminal.black).toBe("#595959");
    expect(darkPureBlackTheme.colors.terminal.brightBlack).toBe("#8a8a8a");
  });
});

describe("Sidebar interaction surfaces", () => {
  it("keeps Light hover and selection darker than the sidebar surface", () => {
    expect(lightTheme.colors.surfaceSidebarHover).toBe(lightTheme.colors.surface3);
    expect(lightTheme.colors.surfaceSidebarSelected).toBe(lightTheme.colors.surface4);
    expect(lightTheme.colors.surfaceSidebarSelected).not.toBe(lightTheme.colors.surfaceSidebar);
  });

  it("derives Dark hover and selection from the first two raised surfaces", () => {
    expect(darkTheme.colors.surfaceSidebarHover).toBe(darkTheme.colors.surface1);
    expect(darkTheme.colors.surfaceSidebarSelected).toBe(darkTheme.colors.surface2);
  });
});

describe("Built-in light theme", () => {
  it("preserves its authored aliases and terminal contrast through the semantic builder", () => {
    expect(lightTheme.colors).toMatchObject({
      primary: "#18181b",
      primaryForeground: "#fafafa",
      destructiveForeground: "#ffffff",
      successForeground: "#ffffff",
      terminal: {
        black: "#1a1a1e",
        brightBlack: "#3f3f46",
      },
    });
  });
});
