// Added for Groupon Desk (fork of Paseo, Apache-2.0): where a desktop popover opens, as plain data.

/**
 * Which side of its trigger a popover opens on, and how tall it may be there (owner finding,
 * 2026-10-21: the composer's model picker on New workspace opened upward and the window's top edge
 * clipped it, so Claude and Codex were off screen).
 * Pure, so the rule is tested without a screen.
 *
 * Responsibilities:
 * - `resolvePopoverPlacement`: below the trigger when it sits in the upper half of the window,
 *   above it otherwise (the side with more room by construction); the height cap is the room on
 *   that side, so a list taller than that scrolls inside the popover instead of leaving the window
 *
 * Constraints:
 * - The cap never exceeds the content height, and never goes below zero
 */

export type PopoverSide = "top" | "bottom";

export interface PopoverPlacementInput {
  /** The trigger's top edge in the window, in pixels. */
  anchorTop: number;
  /** The trigger's height. */
  anchorHeight: number;
  windowHeight: number;
  /** How tall the popover wants to be. */
  contentHeight: number;
  /** The margin kept to the window's edge. */
  padding: number;
  /** The gap between the trigger and the popover. */
  offset: number;
}

export interface PopoverPlacement {
  side: PopoverSide;
  /** The tallest the popover may be on that side, so it stays inside the window. */
  maxHeight: number;
}

export function resolvePopoverPlacement(input: PopoverPlacementInput): PopoverPlacement {
  const { anchorTop, anchorHeight, windowHeight, contentHeight, padding, offset } = input;
  const anchorBottom = anchorTop + anchorHeight;
  const inUpperHalf = anchorTop + anchorHeight / 2 < windowHeight / 2;
  const side: PopoverSide = inUpperHalf ? "bottom" : "top";
  const room =
    side === "top" ? anchorTop - offset - padding : windowHeight - anchorBottom - offset - padding;
  return { side, maxHeight: Math.min(contentHeight, Math.max(0, room)) };
}
