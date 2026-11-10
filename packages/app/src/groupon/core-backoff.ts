// Added for Groupon Desk (fork of Paseo, Apache-2.0): one back-off for every call the window makes to Core, so a client never amplifies an overload.

/**
 * How the window waits after Core failed, in one place. On 2026-11-10, 21:25-21:48 UTC, production
 * Core answered every request with 429 "Rate exceeded" (all its request slots held), and the
 * Groupon Desk clients asked again at once: about 100 requests a second of 429s, token refreshes
 * first among them. Every Core call site of the window (requests, polls, the relay stream) waits by
 * this module's numbers instead; the `groupon` CLI's daemon uses the same ones.
 *
 * Responsibilities:
 * - `backoffDelayMs`: attempt n (0-based, consecutive failures) waits `random() * min(60 s, 1 s * 2^n)`
 *   (full jitter, so a fleet that failed together does not come back together), at least a
 *   `Retry-After` when Core sent one, never more than 300 s
 * - `retryAfterMs`: the `Retry-After` header, delta-seconds or an HTTP date
 * - `isRetryableStatus` / `retryableFailure`: 408, 429, 502, 503, 504 and a network error are worth
 *   asking again later; any other 4xx is an answer and fails at once, as before
 * - `Backoff`: the consecutive failures of one thing, and when it may be asked again
 * - `startCorePoll`: a poll that waits the back-off after a retryable failure, never less than its
 *   interval
 * - `coreQueryRetry`, `coreQueryRetryDelay`, `coreRefetchInterval`: the same rules for a
 *   react-query read of Core
 *
 * Constraints:
 * - Pure: no fetch, no React, no store; time and randomness are injectable for tests
 * - A failure never makes a poll faster than its success interval
 */

export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 60_000;
/** The longest a `Retry-After` is honoured; a larger one is read as this. */
export const RETRY_AFTER_MAX_MS = 300_000;
/** How many times a react-query read of Core is asked again within one fetch. */
export const CORE_QUERY_RETRIES = 2;

const RETRYABLE_STATUSES = new Set([408, 429, 502, 503, 504]);

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

/** The wait a `Retry-After` header asks for, in ms; null when absent or unreadable. */
export function retryAfterMs(
  headers: { get(name: string): string | null } | null | undefined,
  nowMs: number,
): number | null {
  const value = headers?.get("retry-after")?.trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - nowMs) : null;
}

/** The delay before attempt `attempt + 1`, given one draw of `random` in [0, 1). */
export function backoffDelayMs(
  attempt: number,
  randomValue: number,
  retryAfter: number | null = null,
): number {
  const ceiling = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt));
  const jittered = randomValue * ceiling;
  return Math.min(RETRY_AFTER_MAX_MS, Math.max(jittered, retryAfter ?? 0));
}

/**
 * Whether an error is worth asking again later, and the wait Core asked for. Reads the shape of
 * `CoreError` (`retryable`, `retryAfterMs`), so this module needs no import of it; any other error
 * is a bug or a verdict, never retried.
 */
export function retryableFailure(error: unknown): { retryAfterMs: number | null } | null {
  if (typeof error !== "object" || error === null) return null;
  const { retryable, retryAfterMs: wait } = error as {
    retryable?: unknown;
    retryAfterMs?: unknown;
  };
  if (retryable !== true) return null;
  return { retryAfterMs: typeof wait === "number" && wait > 0 ? wait : null };
}

export interface BackoffClock {
  random?: () => number;
  now?: () => number;
}

/** The consecutive failures of one thing (an endpoint, a refresh, a relay stream), and its wait. */
export class Backoff {
  #attempt = 0;
  #readyAt = 0;
  readonly #random: () => number;
  readonly #now: () => number;

  constructor({ random = () => Math.random(), now = () => Date.now() }: BackoffClock = {}) {
    this.#random = random;
    this.#now = now;
  }

  /** Consecutive failures since the last success. */
  get attempt(): number {
    return this.#attempt;
  }

  /** Records a failure; returns how long to wait before the next try. */
  fail(retryAfter: number | null = null): number {
    const delay = backoffDelayMs(this.#attempt, this.#random(), retryAfter);
    this.#attempt += 1;
    this.#readyAt = this.#now() + delay;
    return delay;
  }

  succeed(): void {
    this.#attempt = 0;
    this.#readyAt = 0;
  }

  /** How long until the next try is allowed; 0 when it is now. */
  waitMs(): number {
    return Math.max(0, this.#readyAt - this.#now());
  }
}

export interface CorePollOptions extends BackoffClock {
  /** One read; a rejection is a failed poll. */
  run: () => Promise<void>;
  intervalMs: number;
  onError?: (error: unknown) => void;
}

/**
 * Runs `run` now, then again `intervalMs` after each success, and after
 * a retryable failure the larger of `intervalMs` and the back-off; a failure Core will not change
 * its mind about keeps the interval. Reads never overlap. Returns the stop.
 */
export function startCorePoll({
  run,
  intervalMs,
  onError,
  random,
  now,
}: CorePollOptions): () => void {
  const backoff = new Backoff({ random, now });
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = async () => {
    timer = null;
    let delay = intervalMs;
    try {
      await run();
      backoff.succeed();
    } catch (error) {
      const failure = retryableFailure(error);
      if (failure) delay = Math.max(intervalMs, backoff.fail(failure.retryAfterMs));
      if (!stopped) onError?.(error);
    }
    if (!stopped) timer = setTimeout(() => void tick(), delay);
  };

  timer = setTimeout(() => void tick(), 0);
  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
}

/** react-query's `retry` for a read of Core: a retryable failure, at most twice per fetch. */
export function coreQueryRetry(failureCount: number, error: unknown): boolean {
  return failureCount < CORE_QUERY_RETRIES && retryableFailure(error) !== null;
}

/** react-query's `retryDelay` for a read of Core (its `failureCount` is 0 at the first retry). */
export function coreQueryRetryDelay(
  failureCount: number,
  error: unknown,
  random: () => number = Math.random,
): number {
  return backoffDelayMs(failureCount, random(), retryableFailure(error)?.retryAfterMs ?? null);
}

/** The slice of react-query's `Query` the stretched interval reads. */
export interface CoreQueryLike {
  state: {
    error: unknown;
    errorUpdateCount: number;
    errorUpdatedAt: number;
    dataUpdatedAt: number;
  };
}

interface QueryFailures {
  /** `errorUpdateCount` when the query last succeeded. */
  baseline: number;
  /** The delay drawn for `drawnAt` failures, so every call for one failure answers the same. */
  drawnAt: number;
  delay: number;
}

const queryFailures = new WeakMap<object, QueryFailures>();

/**
 * react-query's `refetchInterval` for a read of Core: `base` while it succeeds, and while its
 * last fetch failed retryably, the larger of `base` and the back-off for its consecutive failures.
 */
export function coreRefetchInterval<Q extends CoreQueryLike>(
  base: number | ((query: Q) => number | false | undefined),
  random: () => number = Math.random,
): (query: Q) => number | false | undefined {
  return (query) => {
    const interval = typeof base === "function" ? base(query) : base;
    const { state } = query;
    const tracked = queryFailures.get(query) ?? { baseline: 0, drawnAt: 0, delay: 0 };
    queryFailures.set(query, tracked);
    const failing = state.errorUpdatedAt > state.dataUpdatedAt;
    if (!failing) {
      tracked.baseline = state.errorUpdateCount;
      return interval;
    }
    const failure = retryableFailure(state.error);
    if (typeof interval !== "number" || failure === null) return interval;
    const failures = state.errorUpdateCount - tracked.baseline;
    if (tracked.drawnAt !== failures) {
      tracked.drawnAt = failures;
      tracked.delay = backoffDelayMs(failures - 1, random(), failure.retryAfterMs);
    }
    return Math.max(interval, tracked.delay);
  };
}
