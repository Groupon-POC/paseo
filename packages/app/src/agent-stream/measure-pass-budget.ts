/**
 * Groupon Desk: caps how many row-measuring passes may resize the virtualizer inside one frame.
 *
 * Every pass that resizes a row re-renders the stream synchronously (a layout effect or a
 * flushSync), and that render runs the pass again. A row whose height flips between two values
 * as other rows resize (it rewraps when the layout moves) never settles, and React aborts the
 * window with "Maximum update depth exceeded" (minified error #185). Past the cap the pass waits
 * for the next frame, which breaks the synchronous chain; the settled DOM is measured there.
 */

export const MAX_MEASURE_PASSES_PER_FRAME = 12;

export interface MeasurePassBudget {
  /** True while this frame may still resize rows synchronously. */
  canMeasure(): boolean;
  /** Records a pass that resized at least one row. */
  recordResize(): void;
  /** Asks for one more pass on the next frame, once. */
  deferToNextFrame(run: () => void): void;
  dispose(): void;
}

export function createMeasurePassBudget(
  schedule: (callback: () => void) => number = (callback) => requestAnimationFrame(callback),
  cancel: (handle: number) => void = (handle) => cancelAnimationFrame(handle),
  maxPasses: number = MAX_MEASURE_PASSES_PER_FRAME,
): MeasurePassBudget {
  let passes = 0;
  let resetHandle: number | null = null;
  let deferredHandle: number | null = null;

  const scheduleReset = () => {
    if (resetHandle !== null) return;
    resetHandle = schedule(() => {
      resetHandle = null;
      passes = 0;
    });
  };

  return {
    canMeasure: () => passes < maxPasses,
    recordResize: () => {
      passes += 1;
      scheduleReset();
    },
    deferToNextFrame: (run) => {
      if (deferredHandle !== null) return;
      deferredHandle = schedule(() => {
        deferredHandle = null;
        passes = 0;
        run();
      });
    },
    dispose: () => {
      if (resetHandle !== null) cancel(resetHandle);
      if (deferredHandle !== null) cancel(deferredHandle);
      resetHandle = null;
      deferredHandle = null;
    },
  };
}
