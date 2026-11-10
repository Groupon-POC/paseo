import { expect, test, vi } from "vitest";
import { OwnedSubscriptions } from "./owned.js";
import type { SessionOutboundMessage } from "@getpaseo/protocol/messages";

interface Snapshot {
  subscriptionId: string;
  requestId: string;
}

function connection() {
  const released: string[] = [];
  const failures: unknown[] = [];
  const requests: Array<(id: string) => void> = [];
  const subscriptions = new OwnedSubscriptions({
    release: async (id) => {
      released.push(id);
    },
    failed: (error) => {
      failures.push(error);
    },
  });
  subscriptions.restore();
  return {
    subscriptions,
    released,
    failures,
    requests,
    observe: (signal?: AbortSignal) =>
      subscriptions.observe<Snapshot>(
        (accept) =>
          new Promise((resolve) => {
            requests.push((subscriptionId) => {
              const snapshot = { subscriptionId, requestId: `request-${requests.length}` };
              accept(snapshot);
              resolve(snapshot);
            });
          }),
        signal,
      ),
  };
}

function update(subscriptionId: string, seq: number): SessionOutboundMessage {
  return {
    type: "agent_update",
    payload: { kind: "remove", agentId: `agent-${seq}`, subscriptionId, seq },
  };
}

test("a caller consuming the snapshot later receives its buffered updates in order", async () => {
  const c = connection();
  const a = c.observe();
  const b = c.observe();
  c.requests[0]!("a");
  c.requests[1]!("b");
  c.subscriptions.receive(update("a", 1));
  c.subscriptions.receive(update("b", 2));
  await a.ready;
  const seen: string[] = [];
  a.subscribe({
    snapshot: (s) => seen.push(s.subscriptionId),
    update: (m) => seen.push(JSON.stringify(m)),
  });
  expect(seen).toEqual(["a", JSON.stringify(update("a", 1))]);
  await a.release();
  c.subscriptions.receive(update("a", 3));
  expect(seen).toHaveLength(2);
  expect(c.released).toEqual(["a"]);
  expect(b.subscriptionId).toBe("b");
  await b.release();
});

test("cancellation before the ID waits for bootstrap and releases exactly that ID", async () => {
  const c = connection();
  const abort = new AbortController();
  const handle = c.observe(abort.signal);
  abort.abort();
  const released = handle.release();
  expect(c.released).toEqual([]);
  c.requests[0]!("cancelled");
  await released;
  await expect(handle.ready).rejects.toThrow("released");
  expect(c.released).toEqual(["cancelled"]);
});

test("surviving handles use new remote IDs after reconnect and released handles stay gone", async () => {
  const c = connection();
  const a = c.observe();
  const b = c.observe();
  c.requests[0]!("old-a");
  c.requests[1]!("old-b");
  await Promise.all([a.ready, b.ready]);
  await b.release();
  const seen: string[] = [];
  a.subscribe({ snapshot: (s) => seen.push(s.subscriptionId), update: () => seen.push("update") });
  c.subscriptions.disconnected();
  c.subscriptions.restore();
  expect(c.requests).toHaveLength(3);
  c.requests[2]!("new-a");
  c.subscriptions.receive(update("old-a", 1));
  c.subscriptions.receive(update("new-a", 2));
  expect(seen).toEqual(["old-a", "new-a", "update"]);
  expect(a.subscriptionId).toBe("new-a");
  await a.release();
});

test("a late listener after bounded replay overflow gets a fresh snapshot", async () => {
  const c = connection();
  const handle = c.observe();
  c.requests[0]!("old");
  await handle.ready;
  const first: string[] = [];
  handle.subscribe({ snapshot: (s) => first.push(s.subscriptionId), update: () => {} });
  for (let seq = 0; seq < 129; seq++) c.subscriptions.receive(update("old", seq));
  const late: string[] = [];
  handle.subscribe({
    snapshot: (s) => late.push(s.subscriptionId),
    update: () => late.push("update"),
  });
  await expect.poll(() => c.requests.length).toBe(2);
  expect(c.released).toEqual(["old"]);
  expect(late).toEqual([]);
  c.requests[1]!("fresh");
  c.subscriptions.receive(update("old", 130));
  c.subscriptions.receive(update("fresh", 131));
  expect(first).toEqual(["old", "fresh"]);
  expect(late).toEqual(["fresh", "update"]);
  await handle.release();
});

/** Requests per subscription, each answerable or failed the way a dropped transport fails it. */
function droppingConnection() {
  const subscriptions = new OwnedSubscriptions({ release: async () => {}, failed: () => {} });
  const sent: Array<{ name: string; answer: (id: string) => void; drop: () => void }> = [];
  subscriptions.restore();
  const observe = (name: string) =>
    subscriptions.observe<Snapshot>(
      (accept) =>
        new Promise((resolve, reject) => {
          sent.push({
            name,
            answer: (subscriptionId) => {
              const snapshot = { subscriptionId, requestId: name };
              accept(snapshot);
              resolve(snapshot);
            },
            drop: () => reject(new Error("Relay stream ended")),
          });
        }),
    );
  const lastSent = (name: string) => sent.findLast((request) => request.name === name);
  const drop = async () => {
    subscriptions.disconnected();
    for (const request of sent) request.drop();
    await vi.advanceTimersByTimeAsync(0);
    subscriptions.restore();
  };
  const sentCount = (name: string) => sent.filter((request) => request.name === name).length;
  return { observe, drop, lastSent, sentCount };
}

test("a subscription in flight at two drops in a row is asked again only after a back-off, the others at once (ENC-12144)", async () => {
  vi.useFakeTimers();
  try {
    const c = droppingConnection();
    c.observe("diff");
    c.observe("agents");
    c.lastSent("agents")!.answer("agents-1");

    await c.drop();
    expect(c.sentCount("diff")).toBe(2);
    c.lastSent("agents")!.answer("agents-2");
    await c.drop();

    expect(c.sentCount("agents")).toBe(3);
    expect(c.sentCount("diff")).toBe(2);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(c.sentCount("diff")).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(c.sentCount("diff")).toBe(3);

    await c.drop();
    await vi.advanceTimersByTimeAsync(3_999);
    expect(c.sentCount("diff")).toBe(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(c.sentCount("diff")).toBe(4);
  } finally {
    vi.useRealTimers();
  }
});

test("the back-off stops at 60 s and ends once the subscription gets its snapshot (ENC-12144)", async () => {
  vi.useFakeTimers();
  try {
    const c = droppingConnection();
    c.observe("diff");
    for (let drop = 0; drop < 8; drop++) {
      await c.drop();
      await vi.advanceTimersByTimeAsync(60_000);
    }
    const before = c.sentCount("diff");
    await c.drop();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(c.sentCount("diff")).toBe(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(c.sentCount("diff")).toBe(before + 1);

    c.lastSent("diff")!.answer("diff-ok");
    await vi.advanceTimersByTimeAsync(0);
    await c.drop();
    expect(c.sentCount("diff")).toBe(before + 2);
  } finally {
    vi.useRealTimers();
  }
});

test("a drop while the subscription waits out its back-off keeps its count (ENC-12144)", async () => {
  vi.useFakeTimers();
  try {
    const c = droppingConnection();
    c.observe("diff");
    await c.drop();
    await c.drop();
    expect(c.sentCount("diff")).toBe(2);

    await c.drop();
    await vi.advanceTimersByTimeAsync(1_999);

    expect(c.sentCount("diff")).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(c.sentCount("diff")).toBe(3);
  } finally {
    vi.useRealTimers();
  }
});
