// Added for Groupon Desk (fork of Paseo, Apache-2.0): the one back-off every Core call of the window waits by.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Backoff,
  BACKOFF_MAX_MS,
  backoffDelayMs,
  coreQueryRetry,
  coreQueryRetryDelay,
  coreRefetchInterval,
  isRetryableStatus,
  RETRY_AFTER_MAX_MS,
  retryableFailure,
  retryAfterMs,
  startCorePoll,
  type CoreQueryLike,
} from "./core-backoff";
import { CoreError } from "./core-client";

const headers = (value: string | null) => ({ get: () => value });
const busy = (retryAfter?: number) =>
  new CoreError("Rate exceeded", 429, { retryAfterMs: retryAfter ?? null });

describe("which failures are asked again", () => {
  it.each([408, 429, 502, 503, 504])("retries %i", (status) => {
    expect(isRetryableStatus(status)).toBe(true);
    expect(retryableFailure(new CoreError("x", status))).toEqual({ retryAfterMs: null });
  });

  it.each([400, 401, 403, 404, 409, 422, 500])("never retries %i", (status) => {
    expect(isRetryableStatus(status)).toBe(false);
    expect(retryableFailure(new CoreError("x", status))).toBeNull();
  });

  it("retries an unreachable Core, but not a verdict of the app's own or a plain bug", () => {
    expect(retryableFailure(new CoreError("down", null, { unreachable: true }))).not.toBeNull();
    expect(retryableFailure(new CoreError("The sign-in was denied.", null))).toBeNull();
    expect(retryableFailure(new Error("boom"))).toBeNull();
    expect(retryableFailure(null)).toBeNull();
  });

  it("carries the wait Core asked for", () => {
    expect(retryableFailure(busy(7_000))).toEqual({ retryAfterMs: 7_000 });
  });
});

describe("retryAfterMs", () => {
  const now = Date.parse("2026-11-10T21:30:00Z");

  it("reads delta-seconds and an HTTP date", () => {
    expect(retryAfterMs(headers("12"), now)).toBe(12_000);
    expect(retryAfterMs(headers("Tue, 10 Nov 2026 21:30:30 GMT"), now)).toBe(30_000);
    expect(retryAfterMs(headers("Tue, 10 Nov 2026 21:29:00 GMT"), now)).toBe(0);
  });

  it("reads nothing from an absent or unreadable header", () => {
    expect(retryAfterMs(headers(null), now)).toBeNull();
    expect(retryAfterMs(headers("soon"), now)).toBeNull();
    expect(retryAfterMs(null, now)).toBeNull();
  });
});

describe("backoffDelayMs", () => {
  it("doubles its ceiling from 1 s per attempt and caps it at 60 s", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 20].map((n) => backoffDelayMs(n, 0.999_999))).toEqual(
      [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000, 60_000].map((ms) =>
        expect.closeTo(ms, -1),
      ),
    );
  });

  it("is jittered over the whole ceiling", () => {
    expect(backoffDelayMs(3, 0)).toBe(0);
    expect(backoffDelayMs(3, 0.25)).toBe(2_000);
    expect(backoffDelayMs(3, 0.5)).toBe(4_000);
  });

  it("waits at least a Retry-After, and never more than 300 s", () => {
    expect(backoffDelayMs(0, 0.5, 30_000)).toBe(30_000);
    expect(backoffDelayMs(6, 0.9, 10_000)).toBe(54_000);
    expect(backoffDelayMs(0, 0.5, 3_600_000)).toBe(RETRY_AFTER_MAX_MS);
  });
});

describe("Backoff", () => {
  it("grows its delays with each failure, jittered, capped, and starts over after a success", () => {
    let clock = 0;
    const draws = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.1];
    const backoff = new Backoff({ random: () => draws.shift() ?? 0.5, now: () => clock });

    const delays = Array.from({ length: 8 }, () => backoff.fail());
    expect(delays).toEqual([500, 1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);
    expect(backoff.attempt).toBe(8);
    expect(backoff.waitMs()).toBe(30_000);
    clock += 10_000;
    expect(backoff.waitMs()).toBe(20_000);

    backoff.succeed();
    expect(backoff.attempt).toBe(0);
    expect(backoff.waitMs()).toBe(0);
    expect(backoff.fail()).toBe(100);
  });

  it("never waits past BACKOFF_MAX_MS without a Retry-After", () => {
    const backoff = new Backoff({ random: () => 0.999_999 });
    for (let i = 0; i < 50; i += 1) expect(backoff.fail()).toBeLessThan(BACKOFF_MAX_MS + 1);
  });
});

describe("startCorePoll", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("polls at its interval while Core answers", async () => {
    const run = vi.fn(async () => undefined);
    const stop = startCorePoll({ run, intervalMs: 10_000 });

    await vi.advanceTimersByTimeAsync(60_000);

    expect(run).toHaveBeenCalledTimes(7);
    stop();
  });

  it("asks Core at most a few times a minute while it answers 429 to everything", async () => {
    const run = vi.fn(async () => {
      throw busy();
    });
    const stop = startCorePoll({ run, intervalMs: 10_000, random: () => 0.5 });

    await vi.advanceTimersByTimeAsync(60_000);
    const firstMinute = run.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);
    const nextTwoMinutes = run.mock.calls.length - firstMinute;
    stop();

    // 0, 10, 20, 30, 40, 50 s (the interval wins), then 66 s and 30 s apart (60 s ceiling at 0.5).
    expect(firstMinute).toBe(6);
    expect(nextTwoMinutes).toBe(4);
  });

  it("keeps its interval through a failure Core will not change its mind about", async () => {
    const run = vi.fn(async () => {
      throw new CoreError("Forbidden", 403);
    });
    const onError = vi.fn();
    const stop = startCorePoll({ run, intervalMs: 10_000, onError });

    await vi.advanceTimersByTimeAsync(30_000);

    expect(run).toHaveBeenCalledTimes(4);
    expect(onError).toHaveBeenCalledTimes(4);
    stop();
  });

  it("starts over at its interval after a success, honours Retry-After, and stops", async () => {
    let answer: () => Promise<void> = async () => {
      throw busy(45_000);
    };
    const run = vi.fn(() => answer());
    const stop = startCorePoll({ run, intervalMs: 10_000, random: () => 0.5 });

    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(44_000);
    expect(run).toHaveBeenCalledTimes(1);
    answer = async () => undefined;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(3);

    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(3);
  });
});

describe("react-query reads of Core", () => {
  it("retries a retryable failure twice per fetch, by the back-off, and nothing else", () => {
    expect(coreQueryRetry(0, busy())).toBe(true);
    expect(coreQueryRetry(1, busy())).toBe(true);
    expect(coreQueryRetry(2, busy())).toBe(false);
    expect(coreQueryRetry(0, new CoreError("Forbidden", 403))).toBe(false);
    expect(coreQueryRetryDelay(0, busy(), () => 0.5)).toBe(500);
    expect(coreQueryRetryDelay(1, busy(5_000), () => 0.5)).toBe(5_000);
  });

  function query(state: Partial<CoreQueryLike["state"]>): CoreQueryLike {
    return {
      state: { error: null, errorUpdateCount: 0, errorUpdatedAt: 0, dataUpdatedAt: 0, ...state },
    };
  }

  it("stretches the refetch interval while the read keeps failing, and restores it after a success", () => {
    const interval = coreRefetchInterval<CoreQueryLike>(15_000, () => 0.999_999);
    const q = query({ dataUpdatedAt: 1 });

    expect(interval(q)).toBe(15_000);
    const failures = [1, 2, 3, 4, 5, 6, 7].map((count) => {
      q.state = { ...q.state, error: busy(), errorUpdateCount: count, errorUpdatedAt: count + 1 };
      return Math.round(interval(q) as number);
    });
    expect(failures).toEqual([15_000, 15_000, 15_000, 15_000, 16_000, 32_000, 60_000]);
    // Asked again for the same failure, it answers the same.
    expect(Math.round(interval(q) as number)).toBe(60_000);

    q.state = { ...q.state, dataUpdatedAt: 100 };
    expect(interval(q)).toBe(15_000);
    q.state = { ...q.state, errorUpdateCount: 8, errorUpdatedAt: 101 };
    expect(interval(q)).toBe(15_000);
  });

  it("keeps the interval for a failure that is not Core's load, and a disabled refetch disabled", () => {
    const failing = query({ error: new CoreError("Forbidden", 403), errorUpdateCount: 9 });
    failing.state.errorUpdatedAt = 5;
    expect(coreRefetchInterval<CoreQueryLike>(15_000)(failing)).toBe(15_000);
    expect(coreRefetchInterval<CoreQueryLike>(() => false)(query({ error: busy() }))).toBe(false);
  });
});
