// Added for Groupon Desk (fork of Paseo, Apache-2.0): handles at the agent output's edges that drag its width, shown as guides until released.

/**
 * Two pale handles beside the agent output's edges, centred in the pane. Dragging one moves both
 * edges (the output stays centred) and draws only guide lines: the chat list does not change until
 * the handle is let go, when the width is kept as a share of the pane (`stream-width.ts`). A double
 * click returns to the content width; Escape cancels a drag.
 *
 * Constraints:
 * - Nothing in the chat list changes during a drag (`groupon-desk-ui-pitfalls`: the list must hear
 *   of a width through React, once)
 * - Hover follows `docs/hover.md`: a fixed hit area, growth by transform only
 */

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";
import { withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import { clampStreamWidth, shareForStreamWidth } from "./stream-width";
import { GROUPON_STREAM_WIDTH } from "./strings";

/** The list's own side padding and a row's, between the pane's edge and the output's text. */
const LIST_SIDE_PADDING = 16;
const ROW_SIDE_PADDING = 8;
/** How far outside the output's text a handle sits. */
const HANDLE_GAP = 14;
const HIT_WIDTH = 16;
const HIT_HEIGHT = 96;
const BAR_WIDTH = 3;
const BAR_HEIGHT = 64;

type Side = -1 | 1;

interface Drag {
  side: Side;
  startX: number;
  startWidth: number;
}

/** Where the output's text starts and ends in the pane for an output this wide. */
function textEdges(paneWidth: number, width: number): { left: number; right: number } {
  const column = Math.min(width, paneWidth - 2 * LIST_SIDE_PADDING) - 2 * ROW_SIDE_PADDING;
  const center = paneWidth / 2;
  return { left: center - column / 2, right: center + column / 2 };
}

function useWidthDrag(input: {
  paneWidth: number;
  streamWidth: number;
  contentMaxWidth: number;
  onCommit: (share: number | null) => void;
}) {
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const widthRef = useRef<number | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const inputRef = useRef(input);
  inputRef.current = input;

  const finish = useCallback((commit: boolean) => {
    const width = widthRef.current;
    cleanupRef.current?.();
    cleanupRef.current = null;
    dragRef.current = null;
    widthRef.current = null;
    setDragWidth(null);
    if (!commit || width === null) return;
    const { paneWidth, contentMaxWidth, onCommit } = inputRef.current;
    onCommit(shareForStreamWidth(width, paneWidth, contentMaxWidth));
  }, []);

  const start = useCallback(
    (side: Side, event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      dragRef.current = { side, startX: event.clientX, startWidth: inputRef.current.streamWidth };
      widthRef.current = inputRef.current.streamWidth;
      setDragWidth(inputRef.current.streamWidth);
      const move = (moveEvent: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const { paneWidth, contentMaxWidth } = inputRef.current;
        const width = clampStreamWidth(
          drag.startWidth + (moveEvent.clientX - drag.startX) * drag.side * 2,
          paneWidth,
          contentMaxWidth,
        );
        widthRef.current = width;
        setDragWidth(width);
      };
      const release = () => finish(true);
      const cancel = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key === "Escape") finish(false);
      };
      const body = document.body.style;
      const previous = { cursor: body.cursor, userSelect: body.userSelect };
      body.cursor = "col-resize";
      body.userSelect = "none";
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", release);
      window.addEventListener("pointercancel", release);
      window.addEventListener("keydown", cancel);
      cleanupRef.current = () => {
        body.cursor = previous.cursor;
        body.userSelect = previous.userSelect;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", release);
        window.removeEventListener("pointercancel", release);
        window.removeEventListener("keydown", cancel);
      };
    },
    [finish],
  );

  useEffect(() => () => cleanupRef.current?.(), []);
  return { dragWidth, start };
}

function StreamWidthHandlesView({
  paneWidth,
  streamWidth,
  contentMaxWidth,
  onCommit,
  handleColor,
  guideColor,
}: {
  paneWidth: number;
  streamWidth: number;
  contentMaxWidth: number;
  onCommit: (share: number | null) => void;
  handleColor: string;
  guideColor: string;
}): ReactElement {
  const { dragWidth, start } = useWidthDrag({ paneWidth, streamWidth, contentMaxWidth, onCommit });
  const edges = textEdges(paneWidth, dragWidth ?? streamWidth);
  const reset = useCallback(() => onCommit(null), [onCommit]);
  const guideStyles = useMemo(
    () =>
      dragWidth === null
        ? null
        : [guideStyle(edges.left, guideColor), guideStyle(edges.right, guideColor)],
    [dragWidth, edges.left, edges.right, guideColor],
  );
  return (
    <div style={OVERLAY_STYLE} data-testid="stream-width-handles">
      {guideStyles ? (
        <>
          <div style={guideStyles[0]} data-testid="stream-width-guide" />
          <div style={guideStyles[1]} data-testid="stream-width-guide" />
        </>
      ) : null}
      <Handle
        side={-1}
        left={Math.max(0, edges.left - HANDLE_GAP - HIT_WIDTH / 2)}
        color={handleColor}
        dragging={dragWidth !== null}
        onStart={start}
        onReset={reset}
      />
      <Handle
        side={1}
        left={Math.min(paneWidth - HIT_WIDTH, edges.right + HANDLE_GAP - HIT_WIDTH / 2)}
        color={handleColor}
        dragging={dragWidth !== null}
        onStart={start}
        onReset={reset}
      />
    </div>
  );
}

function guideStyle(left: number, color: string): CSSProperties {
  return { ...GUIDE_STYLE, left, background: color };
}

const Handle = memo(function Handle({
  side,
  left,
  color,
  dragging,
  onStart,
  onReset,
}: {
  side: Side;
  left: number;
  color: string;
  dragging: boolean;
  onStart: (side: Side, event: ReactPointerEvent<HTMLDivElement>) => void;
  onReset: () => void;
}): ReactElement {
  const [hovered, setHovered] = useState(false);
  const enter = useCallback(() => setHovered(true), []);
  const leave = useCallback(() => setHovered(false), []);
  const down = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => onStart(side, event),
    [onStart, side],
  );
  const hitStyle = useMemo<CSSProperties>(() => ({ ...HIT_STYLE, left }), [left]);
  const active = hovered || dragging;
  const barStyle = useMemo<CSSProperties>(
    () => ({
      ...BAR_STYLE,
      background: color,
      // Paler than the guides: the handles are found by the cursor, not seen from afar.
      opacity: active ? 0.2 : 0.08,
      transform: active ? "scale(1.5, 1.25)" : "scale(1, 1)",
    }),
    [active, color],
  );
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={GROUPON_STREAM_WIDTH.handleLabel}
      title={GROUPON_STREAM_WIDTH.handleLabel}
      data-testid={side < 0 ? "stream-width-handle-left" : "stream-width-handle-right"}
      style={hitStyle}
      onPointerEnter={enter}
      onPointerLeave={leave}
      onPointerDown={down}
      onDoubleClick={onReset}
    >
      <div style={barStyle} />
    </div>
  );
});

const OVERLAY_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  zIndex: 3,
};
const GUIDE_STYLE: CSSProperties = {
  position: "absolute",
  top: 0,
  bottom: 0,
  width: 1,
  // A pale grey line, barely there: it only shows where the edge will land.
  opacity: 0.22,
  pointerEvents: "none",
};
const HIT_STYLE: CSSProperties = {
  position: "absolute",
  top: `calc(45% - ${HIT_HEIGHT / 2}px)`,
  width: HIT_WIDTH,
  height: HIT_HEIGHT,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "col-resize",
  pointerEvents: "auto",
  touchAction: "none",
};
const BAR_STYLE: CSSProperties = {
  width: BAR_WIDTH,
  height: BAR_HEIGHT,
  borderRadius: BAR_WIDTH,
  transition: "opacity 120ms ease, transform 120ms ease",
};

const ThemedHandles = withUnistyles(StreamWidthHandlesView);
const themeColors = (theme: Theme) => ({
  handleColor: theme.colors.foregroundMuted,
  guideColor: theme.colors.foregroundMuted,
});

export function StreamWidthHandles(props: {
  paneWidth: number;
  streamWidth: number;
  contentMaxWidth: number;
  onCommit: (share: number | null) => void;
}): ReactElement {
  return <ThemedHandles {...props} uniProps={themeColors} />;
}
