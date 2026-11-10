// Changed for Groupon Desk (fork of Paseo, Apache-2.0): a subscription in flight at two drops in a row is asked again after a back-off, 2 s doubling to 60 s (ENC-12144).
import type { SessionOutboundMessage } from "@getpaseo/protocol/messages";

export type SubscriptionSnapshot<T> = T & { subscriptionId: string };

export interface SubscriptionObserver<T> {
  snapshot(snapshot: T): void;
  update(message: SessionOutboundMessage): void;
  error?(error: unknown): void;
}

/** A stable local lifetime. IDs change on reconnect; legacy IDs identify local listeners only. */
export interface OwnedSubscription<T> {
  readonly subscriptionId: string | null;
  readonly ready: Promise<SubscriptionSnapshot<T>>;
  subscribe(observer: SubscriptionObserver<SubscriptionSnapshot<T>>): () => void;
  release(): Promise<void>;
}

interface Registration {
  start(): void;
  disconnected(): void;
  receive(message: SessionOutboundMessage): void;
  release(): Promise<void>;
}

export interface OwnedSubscriptionsHost {
  release(subscriptionId: string): Promise<void>;
  failed(error: unknown): void;
}

const MAX_BOOTSTRAP_UPDATES = 128;
/** The first wait before asking again for a subscription that was in flight at two drops in a row. */
export const REPEATED_DROP_FIRST_BACKOFF_MS = 2_000;
export const REPEATED_DROP_MAX_BACKOFF_MS = 60_000;

/**
 * How long to wait before asking again for a subscription whose opening request was in flight at
 * `drops` drops in a row: none for one (an ordinary reconnect), then 2 s, doubling, at most 60 s.
 * A reply too big for the relay ends the connection every time it is asked for (ENC-12144), so
 * asking again at once only drops the connection again.
 */
export function repeatedDropBackoffMs(drops: number): number {
  if (drops < 2) return 0;
  return Math.min(REPEATED_DROP_FIRST_BACKOFF_MS * 2 ** (drops - 2), REPEATED_DROP_MAX_BACKOFF_MS);
}

/** Transport routing and lifetime only; query semantics remain with each domain. */
export class OwnedSubscriptions {
  private readonly registrations = new Set<Registration>();
  private readonly routes = new Map<string, Registration>();
  private generation = 0;
  private connected = false;

  constructor(private readonly host: OwnedSubscriptionsHost) {}

  observe<T>(
    request: (accept: (snapshot: T) => void) => Promise<T>,
    signal?: AbortSignal,
    requestFailed?: () => void,
  ): OwnedSubscription<T> {
    let id: string | null = null;
    let snapshot: SubscriptionSnapshot<T> | undefined;
    let pending: Promise<void> | null = null;
    let teardown: Promise<void> | null = null;
    let disposed = false;
    let overflow = false;
    // Drops in a row that found this subscription's opening request in flight, and the wait that follows.
    let dropsInFlight = 0;
    let backoff: ReturnType<typeof setTimeout> | null = null;
    let backoffElapsed = false;
    const clearBackoff = () => {
      if (backoff !== null) clearTimeout(backoff);
      backoff = null;
      backoffElapsed = false;
    };
    const buffered: SessionOutboundMessage[] = [];
    const observers = new Set<SubscriptionObserver<SubscriptionSnapshot<T>>>();
    let resolve!: (snapshot: SubscriptionSnapshot<T>) => void;
    let reject!: (error: unknown) => void;
    const ready = new Promise<SubscriptionSnapshot<T>>((accept, fail) => {
      resolve = accept;
      reject = fail;
    });
    void ready.catch(() => {});

    const deliver = (
      observer: SubscriptionObserver<SubscriptionSnapshot<T>>,
      message?: SessionOutboundMessage,
    ) => {
      try {
        if (message) observer.update(message);
        else if (snapshot) observer.snapshot(snapshot);
      } catch (error) {
        this.host.failed(error);
      }
    };
    const releaseId = async () => {
      const released = id;
      id = null;
      if (!released) return;
      this.routes.delete(released);
      await this.host.release(released);
    };
    const registration: Registration = {
      start: () => {
        if (disposed || pending || id || !this.connected) return;
        const wait = repeatedDropBackoffMs(dropsInFlight);
        if (wait > 0 && !backoffElapsed) {
          backoff ??= setTimeout(() => {
            backoff = null;
            backoffElapsed = true;
            registration.start();
          }, wait);
          return;
        }
        backoffElapsed = false;
        const generation = this.generation;
        pending = request((value) => {
          if (generation !== this.generation) return;
          assertSubscriptionSnapshot(value);
          dropsInFlight = 0;
          id = value.subscriptionId;
          snapshot = value;
          buffered.length = 0;
          overflow = false;
          if (disposed) return;
          this.routes.set(id, registration);
          for (const observer of observers) deliver(observer);
        })
          .then(() => {
            if (generation === this.generation && !disposed) {
              if (!snapshot) throw new Error("The host omitted its subscription snapshot");
              resolve(snapshot);
            }
            return undefined;
          })
          .catch((error) => {
            if (generation !== this.generation) return;
            reject(error);
            for (const observer of observers) {
              try {
                observer.error?.(error);
              } catch (failure) {
                this.host.failed(failure);
              }
            }
            void handle.release().catch(this.host.failed);
            this.host.failed(error);
            requestFailed?.();
            return undefined;
          })
          .finally(() => {
            pending = null;
            if (generation !== this.generation && !disposed) registration.start();
          });
      },
      disconnected: () => {
        // A drop while the subscription waits out its back-off keeps the count: it was not asked.
        if (pending) dropsInFlight += 1;
        else if (backoff === null) dropsInFlight = 0;
        clearBackoff();
        id = null;
        snapshot = undefined;
        buffered.length = 0;
        overflow = false;
      },
      receive: (message) => {
        if (disposed || ("payload" in message && Object.is(message.payload, snapshot))) return;
        if (buffered.length < MAX_BOOTSTRAP_UPDATES && !overflow) buffered.push(message);
        else {
          buffered.length = 0;
          overflow = true;
        }
        for (const observer of observers) deliver(observer, message);
      },
      release: () => {
        if (teardown) return teardown;
        disposed = true;
        clearBackoff();
        signal?.removeEventListener("abort", abort);
        observers.clear();
        buffered.length = 0;
        if (id) this.routes.delete(id);
        reject(new Error("Subscription released"));
        teardown = (async () => {
          await pending;
          await releaseId();
          this.registrations.delete(registration);
        })();
        return teardown;
      },
    };
    const abort = () => {
      void handle.release().catch(this.host.failed);
    };
    const handle: OwnedSubscription<T> = {
      get subscriptionId() {
        return id;
      },
      ready,
      release: registration.release,
      subscribe: (observer) => {
        if (disposed) throw new Error("Subscription released");
        observers.add(observer);
        if (overflow) {
          overflow = false;
          snapshot = undefined;
          void releaseId()
            .then(() => {
              registration.start();
              return undefined;
            })
            .catch(this.host.failed);
        } else {
          deliver(observer);
          for (const message of buffered) deliver(observer, message);
        }
        return () => {
          observers.delete(observer);
        };
      },
    };
    this.registrations.add(registration);
    if (signal?.aborted) abort();
    else {
      signal?.addEventListener("abort", abort, { once: true });
      registration.start();
    }
    return handle;
  }

  owns(message: SessionOutboundMessage): boolean {
    const payload = "payload" in message ? message.payload : message;
    return (
      "subscriptionId" in payload &&
      typeof payload.subscriptionId === "string" &&
      this.routes.has(payload.subscriptionId)
    );
  }

  receive(message: SessionOutboundMessage): void {
    const payload = "payload" in message ? message.payload : message;
    if ("subscriptionId" in payload && typeof payload.subscriptionId === "string")
      this.routes.get(payload.subscriptionId)?.receive(message);
  }

  restore(): void {
    this.connected = true;
    for (const registration of this.registrations) registration.start();
  }

  disconnected(): void {
    this.connected = false;
    this.generation++;
    this.routes.clear();
    for (const registration of this.registrations) registration.disconnected();
  }

  async close(): Promise<void> {
    await Promise.all([...this.registrations].map((registration) => registration.release()));
  }
}

function assertSubscriptionSnapshot(value: unknown): asserts value is { subscriptionId: string } {
  if (
    value &&
    typeof value === "object" &&
    "subscriptionId" in value &&
    typeof value.subscriptionId === "string" &&
    value.subscriptionId
  )
    return;
  throw new Error("The host omitted its subscription ID");
}
