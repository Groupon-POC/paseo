import { describe, expect, it } from "vitest";
import { createMeasurePassBudget } from "./measure-pass-budget";

function fakeFrames() {
  let next = 1;
  const queued = new Map<number, () => void>();
  return {
    schedule: (callback: () => void) => {
      const handle = next++;
      queued.set(handle, callback);
      return handle;
    },
    cancel: (handle: number) => {
      queued.delete(handle);
    },
    flush: () => {
      const callbacks = [...queued.values()];
      queued.clear();
      for (const callback of callbacks) callback();
    },
    pending: () => queued.size,
  };
}

describe("measure pass budget", () => {
  it("stops a row that never settles from resizing past the cap in one frame", () => {
    const frames = fakeFrames();
    const budget = createMeasurePassBudget(frames.schedule, frames.cancel, 3);
    let passes = 0;
    while (budget.canMeasure()) {
      budget.recordResize();
      passes += 1;
      if (passes > 100) break;
    }
    expect(passes).toBe(3);
  });

  it("measures again on the next frame, once, however often the pass is deferred", () => {
    const frames = fakeFrames();
    const budget = createMeasurePassBudget(frames.schedule, frames.cancel, 1);
    budget.recordResize();
    let runs = 0;
    budget.deferToNextFrame(() => {
      runs += 1;
    });
    budget.deferToNextFrame(() => {
      runs += 1;
    });
    expect(budget.canMeasure()).toBe(false);
    frames.flush();
    expect(runs).toBe(1);
    expect(budget.canMeasure()).toBe(true);
  });

  it("cancels its frames when disposed", () => {
    const frames = fakeFrames();
    const budget = createMeasurePassBudget(frames.schedule, frames.cancel, 1);
    budget.recordResize();
    budget.deferToNextFrame(() => {
      throw new Error("ran after dispose");
    });
    budget.dispose();
    expect(frames.pending()).toBe(0);
  });
});
