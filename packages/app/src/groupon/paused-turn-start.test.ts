// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for a turn's clock standing still while the agent waits on the person.

import { describe, expect, it } from "vitest";
import { nextTurnPause, type TurnPause } from "./paused-turn-start";

const fresh: TurnPause = { turn: 1000, paused: 0, since: null };

describe("a running turn's clock while the agent waits on the person", () => {
  it("adds up each wait of the turn and only those", () => {
    let pause = nextTurnPause(fresh, 1000, true, 5_000);
    expect(pause).toEqual({ turn: 1000, paused: 0, since: 5_000 });
    pause = nextTurnPause(pause, 1000, true, 9_000);
    expect(pause.since).toBe(5_000);
    pause = nextTurnPause(pause, 1000, false, 65_000);
    expect(pause).toEqual({ turn: 1000, paused: 60_000, since: null });
    pause = nextTurnPause(pause, 1000, true, 70_000);
    pause = nextTurnPause(pause, 1000, false, 80_000);
    expect(pause.paused).toBe(70_000);
  });

  it("starts a new turn with no waits", () => {
    const old: TurnPause = { turn: 1000, paused: 60_000, since: null };

    expect(nextTurnPause(old, 2000, false, 90_000)).toEqual({ turn: 2000, paused: 0, since: null });
  });
});
