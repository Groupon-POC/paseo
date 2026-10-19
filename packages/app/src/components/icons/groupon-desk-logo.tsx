// Added for Groupon Desk (fork of Paseo, Apache-2.0): the Groupon "G", drawn after Groupon Desk's app icon.
import Svg, { Path, Rect } from "react-native-svg";

/** Groupon Desk's green (`BrandColor.swift` in the monorepo). */
export const GROUPON_DESK_GREEN = "#007C1F";

/**
 * The G of the app icon as one path on a 1024 grid: a ring (outer radius 257, inner 130, centred
 * at 512) with the slot cut above the bar, and the bar (483 to the rim, 481 to 580).
 */
const G_PATH =
  "M 753.8 425 L 608.6 425 A 130 130 0 1 0 622.8 580 L 483 580 L 483 481 L 767.1 481 A 257 257 0 1 1 753.8 425 Z";

interface GrouponDeskLogoProps {
  size?: number;
  /** The glyph's colour: Groupon green alone, white on a tile, unless given. */
  color?: string;
  /** The app icon's shape: the white G on the green rounded square. */
  tile?: boolean;
}

export function GrouponDeskLogo({ size = 64, color, tile = false }: GrouponDeskLogoProps) {
  if (tile) {
    return (
      <Svg width={size} height={size} viewBox="92 92 840 840" fill="none">
        <Rect x={92} y={92} width={840} height={840} rx={188} fill={GROUPON_DESK_GREEN} />
        <Path d={G_PATH} fill={color ?? "#FFFFFF"} />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="240 240 544 544" fill="none">
      <Path d={G_PATH} fill={color ?? GROUPON_DESK_GREEN} />
    </Svg>
  );
}
