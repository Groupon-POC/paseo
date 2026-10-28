// Added for Groupon Desk (fork of Paseo, Apache-2.0): a count that rolls to its new value, digit by digit, like a departures board.

/**
 * When the text changes, each character that changed slides out and its new one slides in: up when
 * the number grew, down when it shrank; the characters that stayed do not move. A CSS animation,
 * so it costs no JavaScript per frame; the first render does not roll.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";

const ROLL_MS = 320;

const KEYFRAMES = `@keyframes groupon-roll-in-up { from { transform: translateY(80%); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes groupon-roll-out-up { from { transform: none; opacity: 1; } to { transform: translateY(-80%); opacity: 0; } }
@keyframes groupon-roll-in-down { from { transform: translateY(-80%); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes groupon-roll-out-down { from { transform: none; opacity: 1; } to { transform: translateY(80%); opacity: 0; } }`;

const SLOT: CSSProperties = {
  display: "inline-block",
  position: "relative",
  overflow: "hidden",
  verticalAlign: "bottom",
};
const STILL: CSSProperties = { display: "inline-block" };
const animated = (name: string, outgoing: boolean): CSSProperties => ({
  display: "inline-block",
  ...(outgoing ? { position: "absolute", left: 0, top: 0 } : null),
  animation: `${name} ${ROLL_MS}ms cubic-bezier(0.2, 0.7, 0.2, 1) both`,
});
const IN_UP = animated("groupon-roll-in-up", false);
const OUT_UP = animated("groupon-roll-out-up", true);
const IN_DOWN = animated("groupon-roll-in-down", false);
const OUT_DOWN = animated("groupon-roll-out-down", true);

const numberOf = (text: string) => Number(text.replace(/[^\d.]/g, "")) || 0;

interface Roll {
  from: string;
  to: string;
  up: boolean;
  key: number;
}

export function RollingCount({ text }: { text: string }): ReactElement {
  const shownRef = useRef(text);
  const [roll, setRoll] = useState<Roll | null>(null);
  useEffect(() => {
    const from = shownRef.current;
    if (from === text) return;
    shownRef.current = text;
    setRoll({ from, to: text, up: numberOf(text) >= numberOf(from), key: Date.now() });
    const timer = setTimeout(() => setRoll(null), ROLL_MS + 40);
    return () => clearTimeout(timer);
  }, [text]);
  if (!roll || roll.to !== text) return <span>{text}</span>;

  // Right-aligned, as digits are: "9" to "10" rolls the 9 into a 0 and brings a 1 in beside it.
  const width = Math.max(roll.from.length, roll.to.length);
  const cells = rollCells(roll.from.padStart(width, " "), roll.to.padStart(width, " "), roll.key);
  const incoming = roll.up ? IN_UP : IN_DOWN;
  const outgoing = roll.up ? OUT_UP : OUT_DOWN;
  return (
    <span data-testid="rolling-count">
      <style>{KEYFRAMES}</style>
      {cells.map((cell) =>
        cell.from === cell.to ? (
          <span key={cell.key} style={STILL}>
            {cell.to}
          </span>
        ) : (
          <span key={cell.key} style={SLOT}>
            <span style={incoming}>{cell.to.trim()}</span>
            <span style={outgoing}>{cell.from.trim()}</span>
          </span>
        ),
      )}
    </span>
  );
}

/** Each character's place, counted from the right, and what it was and becomes. */
function rollCells(from: string, to: string, rollKey: number) {
  const cells: { key: string; from: string; to: string }[] = [];
  for (let place = to.length - 1; place >= 0; place -= 1) {
    const fromChar = from[place] ?? " ";
    const toChar = to[place] ?? " ";
    const fromRight = to.length - place;
    cells.unshift({
      key: fromChar === toChar ? `still-${fromRight}` : `${rollKey}-${fromRight}`,
      from: fromChar,
      to: toChar,
    });
  }
  return cells;
}
