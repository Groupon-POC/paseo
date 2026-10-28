// Added for Groupon Desk (fork of Paseo, Apache-2.0): a running turn's clock stands still while the agent waits on the person.

/**
 * The turn footer counts a running turn's time from its start. While the agent waits on the
 * person (a question, a permission) the footer hides; without this the time spent waiting would
 * still be counted once the person answered. The start the footer counts from moves forward by
 * every wait of the turn, so its clock shows only the agent's own time.
 */

import { useEffect, useMemo, useState } from "react";

export interface TurnPause {
  /** The turn these waits belong to: its start, in ms. */
  turn: number | null;
  /** Waits that ended, in ms. */
  paused: number;
  /** When the wait now running began; null when none runs. */
  since: number | null;
}

/** The pause state once `waiting` is what it is at `now`; a new turn starts with none. */
export function nextTurnPause(
  current: TurnPause,
  turn: number | null,
  waiting: boolean,
  now: number,
): TurnPause {
  const base = current.turn === turn ? current : { turn, paused: 0, since: null };
  if (waiting && base.since === null) return { ...base, since: now };
  if (!waiting && base.since !== null) {
    return { turn, paused: base.paused + (now - base.since), since: null };
  }
  return base;
}

/** The start a running turn's clock counts from, moved forward by the turn's waits on the person. */
export function usePausedTurnStart(startedAt: Date | null, waiting: boolean): Date | null {
  const turn = startedAt?.getTime() ?? null;
  const [pause, setPause] = useState<TurnPause>({ turn, paused: 0, since: null });
  useEffect(() => {
    setPause((current) => nextTurnPause(current, turn, waiting, Date.now()));
  }, [turn, waiting]);
  const paused = pause.turn === turn ? pause.paused : 0;
  return useMemo(() => {
    if (turn === null || paused === 0) return startedAt;
    return new Date(turn + paused);
  }, [paused, startedAt, turn]);
}
