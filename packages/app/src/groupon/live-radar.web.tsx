// Added for Groupon Desk (fork of Paseo, Apache-2.0): the Monitor pill's breathing radar on the web, a CSS animation that costs no JavaScript per frame.

import { type CSSProperties, type ReactElement } from "react";
import { Radar } from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";

const ThemedRadar = withUnistyles(Radar);
const liveColor = (theme: Theme) => ({ color: theme.colors.accent });

const KEYFRAMES = `@keyframes groupon-radar-breathe {
  from { opacity: 0.45; transform: scale(0.88); }
  to { opacity: 1; transform: scale(1.08); }
}`;
const BREATHING: CSSProperties = {
  display: "inline-flex",
  animation: "groupon-radar-breathe 1.1s ease-in-out infinite alternate",
};

/** The radar breathes while a watch runs: a slow pulse of its size and strength. */
export function LiveRadar(): ReactElement {
  return (
    <span style={BREATHING} data-testid="groupon-agent-monitors-live">
      <style>{KEYFRAMES}</style>
      <ThemedRadar size={14} uniProps={liveColor} />
    </span>
  );
}
