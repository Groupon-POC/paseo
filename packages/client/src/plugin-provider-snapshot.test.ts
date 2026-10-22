// Added for Groupon Desk (fork of Paseo, Apache-2.0): a plugin reads expanded provider entries over the app's wire-mode client.
import { afterEach, expect, test } from "vitest";
import { compactProviderSnapshot } from "@getpaseo/protocol/provider-snapshot-codec";
import type { ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";
import { DaemonClient } from "./daemon-client.js";
import { createPaseoApi, type PaseoProviderSnapshotUpdate } from "./index.js";

type Handler = (...args: unknown[]) => void;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 1;
  sent: string[] = [];
  onopen: Handler | null = null;
  onmessage: Handler | null = null;
  onclose: Handler | null = null;
  onerror: Handler | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
    const message = JSON.parse(data).message;
    if (message?.type === "subscription.release.request")
      this.session({
        type: "subscription.release.response",
        payload: { requestId: message.requestId, subscriptionId: message.subscriptionId },
      });
  }

  close(): void {
    this.readyState = 3;
  }

  open(): void {
    this.onopen?.();
  }

  session(message: object): void {
    this.onmessage?.({ data: JSON.stringify({ type: "session", message }) });
  }

  lastRequest(): { type: string; requestId?: string; cwd?: string } {
    const frame = JSON.parse(this.sent.at(-1) ?? "{}");
    return frame.message ?? {};
  }
}

afterEach(() => {
  FakeWebSocket.instances.length = 0;
});

// The desk's provider list: the standard ids, and a desk account as one more entry of the same shape.
const ENTRIES: ProviderSnapshotEntry[] = [
  {
    provider: "claude",
    label: "Claude",
    status: "ready",
    enabled: true,
    models: [
      {
        provider: "claude",
        id: "claude-opus-4-7",
        label: "Opus",
        isDefault: true,
        thinkingOptions: [{ id: "high", label: "High", isDefault: true }],
        defaultThinkingOptionId: "high",
      },
    ],
  },
  {
    provider: "codex",
    label: "Codex",
    status: "ready",
    enabled: true,
    models: [{ provider: "codex", id: "gpt-5.5", label: "GPT-5.5" }],
  },
  {
    provider: "claude-f95be97b",
    label: "Claude (zarubto)",
    status: "ready",
    enabled: true,
    models: [{ provider: "claude-f95be97b", id: "claude-opus-4-7", label: "Opus" }],
  },
];

const COMPACT = compactProviderSnapshot(ENTRIES);

/** The app's own client: "wire" mode, compact bodies left for its snapshot cache. */
async function connectWireClient(): Promise<{ client: DaemonClient; ws: FakeWebSocket }> {
  const client = new DaemonClient({
    url: "ws://daemon.test",
    clientId: "plugin-host",
    clientType: "mobile",
    providerSnapshots: "wire",
    webSocketFactory: (url) => new FakeWebSocket(url),
    reconnect: { enabled: false },
  });
  const connecting = client.connect();
  const ws = FakeWebSocket.instances[0];
  ws.open();
  ws.session({
    type: "status",
    payload: {
      status: "server_info",
      serverId: "srv_plugin_test",
      hostname: null,
      version: null,
      features: { providersSnapshotCwd: true, ownedSubscriptions: true },
    },
  });
  await connecting;
  return { client, ws };
}

function acknowledgeObservation(ws: FakeWebSocket, subscriptionId: string): void {
  const request = ws.lastRequest();
  ws.session({
    type: request.type.replace(/([._])request$/, "$1response"),
    payload: { requestId: request.requestId, subscriptionId },
  });
}

function answerSnapshot(ws: FakeWebSocket, cwd?: string): void {
  const request = ws.lastRequest();
  expect(request.type).toBe("get_providers_snapshot_request");
  ws.session({
    type: "get_providers_snapshot_response",
    payload: {
      requestId: request.requestId,
      ...(cwd ? { cwd } : {}),
      entries: [],
      snapshotHash: "hash-1",
      compactSnapshot: COMPACT,
      generatedAt: "2026-10-22T09:00:00.000Z",
    },
  });
}

function pluginShape(entries: readonly ProviderSnapshotEntry[]) {
  return entries
    .filter((entry) => entry.enabled)
    .map((entry) => ({
      provider: entry.provider,
      label: entry.label,
      status: entry.status,
      models: (entry.models ?? []).map((model) => model.id),
    }));
}

const EXPECTED = [
  { provider: "claude", label: "Claude", status: "ready", models: ["claude-opus-4-7"] },
  { provider: "codex", label: "Codex", status: "ready", models: ["gpt-5.5"] },
  {
    provider: "claude-f95be97b",
    label: "Claude (zarubto)",
    status: "ready",
    models: ["claude-opus-4-7"],
  },
];

test("the daemon client itself keeps the compact body in wire mode (the app's cache reads it)", async () => {
  const { client, ws } = await connectWireClient();
  const raw = client.getProvidersSnapshot();
  answerSnapshot(ws);
  const payload = await raw;
  expect(payload.entries).toEqual([]);
  expect(payload.compactSnapshot).toEqual(COMPACT);
  await client.close();
});

test("a plugin's providers.snapshot() reads every enabled provider with its models over a wire-mode client", async () => {
  const { client, ws } = await connectWireClient();
  const paseo = createPaseoApi(client);
  const snapshot = paseo.providers.snapshot();
  answerSnapshot(ws);
  const result = await snapshot;
  expect(pluginShape(result.entries)).toEqual(EXPECTED);
  expect(result.entries[0]?.models?.[0]?.defaultThinkingOptionId).toBe("high");
  await paseo.dispose();
  await client.close();
});

test("a plugin's providers.subscribe() gets entries for a hash-only announcement", async () => {
  const { client, ws } = await connectWireClient();
  const paseo = createPaseoApi(client);
  const updates: PaseoProviderSnapshotUpdate[] = [];
  const unsubscribe = paseo.providers.subscribe((update) => updates.push(update));
  acknowledgeObservation(ws, "plugin-provider-updates");
  ws.session({
    type: "providers_snapshot_update",
    payload: {
      subscriptionId: "plugin-provider-updates",
      cwd: "/repo",
      entries: [],
      snapshotHash: "hash-1",
      generatedAt: "2026-10-22T09:00:00.000Z",
    },
  });
  await expect
    .poll(() => ws.lastRequest())
    .toMatchObject({
      type: "get_providers_snapshot_request",
      cwd: "/repo",
    });
  answerSnapshot(ws, "/repo");
  await expect.poll(() => updates.length).toBe(1);
  expect(pluginShape(updates[0]!.entries)).toEqual(EXPECTED);
  expect(updates[0]!.subscriptionId).toBe("plugin-provider-updates");
  unsubscribe();
  await paseo.dispose();
  await client.close();
});

test("a plugin's providers.waitForReady() reads the body behind a hash-only announcement", async () => {
  const { client, ws } = await connectWireClient();
  const paseo = createPaseoApi(client);
  const ready = paseo.providers.waitForReady({ timeoutMs: 5_000 });
  acknowledgeObservation(ws, "plugin-provider-wait");
  await expect.poll(() => ws.lastRequest().type).toBe("get_providers_snapshot_request");
  const first = ws.lastRequest();
  ws.session({
    type: "get_providers_snapshot_response",
    payload: {
      requestId: first.requestId,
      entries: [],
      snapshotHash: "hash-0",
      compactSnapshot: compactProviderSnapshot([
        { provider: "claude", status: "loading", enabled: true },
      ]),
      generatedAt: "2026-10-22T08:59:00.000Z",
    },
  });
  ws.session({
    type: "providers_snapshot_update",
    payload: {
      subscriptionId: "plugin-provider-wait",
      entries: [],
      snapshotHash: "hash-1",
      generatedAt: "2026-10-22T09:00:00.000Z",
    },
  });
  await expect.poll(() => ws.lastRequest().requestId).not.toBe(first.requestId);
  answerSnapshot(ws);
  const result = await ready;
  expect(result.requestId).toBe(first.requestId);
  expect(pluginShape(result.entries)).toEqual(EXPECTED);
  await paseo.dispose();
  await client.close();
});
