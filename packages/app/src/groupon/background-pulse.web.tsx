// Added for Groupon Desk (fork of Paseo, Apache-2.0): the sidebar's mark for a workspace whose agent runs a background task (a Monitor watch, a background command): a teal dot that breathes.

import { useMemo, type CSSProperties, type ReactElement } from "react";
import { withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";

// Breathes rather than turns, so it never reads as the working ring (the person's pick, 2026-10-28).
const BREATH_MS = 2_000;

const KEYFRAMES = `@keyframes groupon-background-pulse {
  0%, 100% { transform: scale(0.75); opacity: 0.55; box-shadow: 0 0 0 0 transparent; }
  50% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 3px var(--pulse-halo); }
}
@media (prefers-reduced-motion: reduce) { [data-testid="background-pulse"] { animation: none !important; opacity: 1 !important; } }`;

function PulseView({ color }: { color: string }): ReactElement {
  const style = useMemo(
    () =>
      ({
        display: "block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        backgroundColor: color,
        "--pulse-halo": `color-mix(in srgb, ${color} 18%, transparent)`,
        animation: `groupon-background-pulse ${BREATH_MS}ms ease-in-out infinite`,
      }) as CSSProperties,
    [color],
  );
  return (
    <>
      <style>{KEYFRAMES}</style>
      <span style={style} data-testid="background-pulse" aria-hidden />
    </>
  );
}

const ThemedPulse = withUnistyles(PulseView);
const pulseColor = (theme: Theme) => ({ color: theme.colors.statusDotBackground });

export function BackgroundPulse(): ReactElement {
  return <ThemedPulse uniProps={pulseColor} />;
}
