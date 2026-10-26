// Install runtime polyfills before any other module evaluates. Keep this the first import.
// oxlint-disable-next-line import/no-unassigned-import -- Polyfills install on import.
import "./src/polyfills/install-early";
// Changed for Groupon Desk (fork of Paseo, Apache-2.0): Zod parses without `new Function`, before any schema runs.
// oxlint-disable-next-line import/no-unassigned-import -- Configures Zod on import.
import "./src/groupon/zod-jitless";

// Configure Unistyles before Expo Router pulls in any components using StyleSheet.
import "./src/styles/unistyles";
// oxlint-disable-next-line import/no-unassigned-import -- Preserve Expo's entry side effects.
import "@expo/metro-runtime";
// oxlint-disable-next-line import/no-unassigned-import -- Preserve Expo's entry side effects.
import "expo-router/build/fast-refresh";
import { renderRootComponent } from "expo-router/build/renderRootComponent";
import { RootApp } from "./src/root-app";

renderRootComponent(RootApp);
