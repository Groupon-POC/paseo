// Changed for Groupon Desk (fork of Paseo, Apache-2.0): the app opens in the Groupon dark theme, not the system one.
import { StyleSheet } from "react-native-unistyles";
import { REGISTERED_THEMES } from "./theme";

StyleSheet.configure({
  themes: REGISTERED_THEMES,
  breakpoints: {
    xs: 0,
    sm: 576,
    medium: 600,
    md: 720,
    lg: 992,
    xl: 1200,
  },
  settings: {
    // The theme before the stored choice is read, so the Groupon sign-in gate (outside the
    // AppearanceProvider) and a fresh install open in Groupon dark (DEFAULT_THEME_PREFERENCE).
    // AppearanceProvider then applies the stored preference, "auto" included.
    initialTheme: "grouponDark",
  },
});

// Type augmentation for TypeScript
type AppThemes = typeof REGISTERED_THEMES;

interface AppBreakpoints {
  xs: number;
  sm: number;
  medium: number;
  md: number;
  lg: number;
  xl: number;
}

declare module "react-native-unistyles" {
  export interface UnistylesThemes extends AppThemes {}
  export interface UnistylesBreakpoints extends AppBreakpoints {}
}
