// Added for Groupon Desk (fork of Paseo, Apache-2.0): the { G } mark, the work window's own sign.
import Svg, { G, Path } from "react-native-svg";
import { withUnistyles } from "react-native-unistyles";

interface GrouponMarkProps {
  /** The width; the mark is wider than tall (660 by 436 units). */
  size?: number;
  /** The one colour of the mark; `ThemedGrouponMark` reads the theme's foreground for it. */
  color?: string;
}

/**
 * The Groupon G set in curly braces, the same vector as the app icon
 * (`packages/desktop/assets/brand/icon-mono.svg`), drawn in one colour (`ThemedGrouponMark`
 * takes the theme's foreground). Where Paseo drew its own logo (the startup splash, the sign-in
 * gate, Your Macs, the home page, Paseo's own tool calls), this is what Groupon Desk shows; the
 * plain G on a green tile is not the window's sign (owner, 2026-10-20).
 */
const BRACE =
  "M308 333.6 C280.29 333.6 257.82 356.06 257.82 383.78 L257.82 452 C257.82 485 245.12 496.48 229.6 512 C245.12 527.52 257.82 539 257.82 572 L257.82 640.22 C257.82 667.94 280.29 690.4 308 690.4";
const G_PATH =
  "M143 72.479c0 15.372-3.9 28.435-11.88 39.961C117.874 131.473 95.659 143 72.1 143c-20.454 0-37.787-7.488-51.426-21.704C7.626 107.656 1 90.738 1 70.562c0-18.834 7.404-36.129 21.033-49.379C35.671 7.912 52.82 1 72.482 1c29.614 0 55.514 17.877 66.617 47.074h-38.576c-8.565-8.84-17.51-13.251-28.424-13.251-20.254 0-36.232 16.328-36.232 35.925 0 21.724 17.142 38.434 36.232 38.434 12.847 0 24.337-6.526 31.175-18.443H63.723V63.445h78.874c.202 3.078.403 6.151.403 9.034z";

/** The mark's height for a width: it is 660 by 436 units. */
export function grouponMarkHeight(width: number): number {
  return Math.round((width * 436) / 660);
}

/** The mark as a black SVG document, for a CSS mask (the startup splash's shimmer on the web). */
export const GROUPON_MARK_MASK_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='182 294 660 436'><g fill='none' stroke='black' stroke-width='67.2' stroke-linejoin='round'><path d='${BRACE}'/><path d='${BRACE}' transform='matrix(-1 0 0 1 1024 0)'/></g><path fill='black' transform='translate(339.61 339.61) scale(2.39437)' d='${G_PATH}'/></svg>`;

export function GrouponMark({ size = 96, color = "#000000" }: GrouponMarkProps) {
  const paint = color;
  const height = grouponMarkHeight(size);
  const brace = BRACE;
  return (
    <Svg width={size} height={height} viewBox="182 294 660 436" fill="none" testID="groupon-mark">
      <G fill="none" stroke={paint} strokeWidth={67.2} strokeLinejoin="round" strokeLinecap="butt">
        <Path d={brace} />
        <Path d={brace} transform="matrix(-1 0 0 1 1024 0)" />
      </G>
      <Path fill={paint} transform="translate(339.61 339.61) scale(2.39437)" d={G_PATH} />
    </Svg>
  );
}

/** The mark in the theme's foreground colour, for a screen with nothing else to say about it. */
export const ThemedGrouponMark = withUnistyles(GrouponMark, (theme) => ({
  color: theme.colors.foreground,
}));
