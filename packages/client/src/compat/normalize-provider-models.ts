// Changed for Groupon Desk (fork of Paseo, Apache-2.0): the public SDK expands a compact provider snapshot a borrowed wire-mode client left compact.
import type { AgentModelDefinition, ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";
import { normalizeAgentModelDefinition } from "@getpaseo/protocol/agent-types";
import { expandProviderSnapshot } from "@getpaseo/protocol/provider-snapshot-codec";
import type {
  GetProvidersSnapshotResponseMessage,
  ListProviderModelsResponseMessage,
  SessionOutboundMessage,
} from "@getpaseo/protocol/messages";

type ListProviderModelsPayload = ListProviderModelsResponseMessage["payload"];
type GetProvidersSnapshotPayload = GetProvidersSnapshotResponseMessage["payload"];
type ProvidersSnapshotUpdatePayload = Extract<
  SessionOutboundMessage,
  { type: "providers_snapshot_update" }
>["payload"];

// COMPAT(model-normalize): daemon normalizes at source (provider-registry) — shim covers older daemons; drop when floor >= v0.1.104
function normalizeAgentModels(
  models: AgentModelDefinition[] | undefined,
): AgentModelDefinition[] | undefined {
  if (!models) {
    return models;
  }

  let changed = false;
  const normalized = models.map((model) => {
    const next = normalizeAgentModelDefinition(model);
    changed ||= next !== model;
    return next;
  });

  return changed ? normalized : models;
}

function normalizeProviderSnapshotEntry(entry: ProviderSnapshotEntry): ProviderSnapshotEntry {
  const models = normalizeAgentModels(entry.models);
  return models === entry.models ? entry : { ...entry, models };
}

function normalizeProviderSnapshotEntries(
  entries: ProviderSnapshotEntry[],
): ProviderSnapshotEntry[] {
  let changed = false;
  const normalized = entries.map((entry) => {
    const next = normalizeProviderSnapshotEntry(entry);
    changed ||= next !== entry;
    return next;
  });

  return changed ? normalized : entries;
}

export function normalizeListProviderModelsPayload(
  payload: ListProviderModelsPayload,
): ListProviderModelsPayload {
  const models = normalizeAgentModels(payload.models);
  return models === payload.models ? payload : { ...payload, models };
}

export function normalizeProvidersSnapshotPayload<
  T extends GetProvidersSnapshotPayload | ProvidersSnapshotUpdatePayload,
>(payload: T, expand = true): T {
  if (payload.compactSnapshot && !expand) return payload;
  const decoded = payload.compactSnapshot
    ? expandProviderSnapshot(payload.compactSnapshot)
    : normalizeProviderSnapshotEntries(payload.entries);
  const freshness = payload.fetchedAt;
  const entries =
    freshness && expand
      ? decoded.map((entry) =>
          freshness[entry.provider] ? { ...entry, fetchedAt: freshness[entry.provider] } : entry,
        )
      : decoded;
  return entries === payload.entries ? payload : { ...payload, entries };
}

/**
 * The public SDK's view of a provider snapshot: entries, never a compact body. The app's own
 * client runs in "wire" mode and leaves compact bodies for its snapshot cache, so a plugin that
 * borrows it would otherwise read `entries: []` (paseo-bots' empty provider picker, 2026-10-22).
 * A payload the client already expanded is returned as it is.
 */
export function expandProvidersSnapshotForSdk<
  T extends GetProvidersSnapshotPayload | ProvidersSnapshotUpdatePayload,
>(payload: T): T {
  if (!payload.compactSnapshot || payload.entries.length > 0) return payload;
  return normalizeProvidersSnapshotPayload(payload, true);
}

/** An announcement that names the snapshot by hash only; its body has to be fetched. */
export function isProvidersSnapshotReference(
  payload: GetProvidersSnapshotPayload | ProvidersSnapshotUpdatePayload,
): boolean {
  return !!payload.snapshotHash && !payload.compactSnapshot && payload.entries.length === 0;
}

export function normalizeProviderSnapshotUpdateMessage(
  msg: SessionOutboundMessage,
  expand = true,
): SessionOutboundMessage {
  if (msg.type !== "providers_snapshot_update") {
    return msg;
  }

  return { ...msg, payload: normalizeProvidersSnapshotPayload(msg.payload, expand) };
}
