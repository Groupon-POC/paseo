// Added for Groupon Desk (fork of Paseo, Apache-2.0): the largest message a relay socket may be sent, and what a refused one is logged and answered with (ENC-12144).
import { MAX_RELAY_WEBSOCKET_MESSAGE_BYTES } from "@getpaseo/protocol/websocket-message-limit";
import { maxSecuredPlaintextByteLength } from "@getpaseo/relay";

/**
 * Largest plaintext message one relay frame carries once encrypted and base64-encoded. A bigger
 * one would close the daemon's relay socket with 1009 and the window would ask for it again, in a
 * loop (ENC-12144), so it is never sent: its request fails instead.
 */
export const RELAY_MAX_PLAINTEXT_BYTES = maxSecuredPlaintextByteLength(
  MAX_RELAY_WEBSOCKET_MESSAGE_BYTES,
);

export const RELAY_FRAME_TOO_LARGE_CODE = "relay_frame_too_large";

/** What the log line and the error reply say of a refused message; never its content. */
export interface OversizedMessageFacts {
  messageType: string;
  requestId?: string;
  subscriptionId?: string;
  cwd?: string;
}

export function describeOversizedMessage(message: unknown): OversizedMessageFacts {
  const outer = asRecord(message);
  const inner = outer?.type === "session" ? asRecord(outer.message) : outer;
  const payload = asRecord(inner?.payload);
  return {
    messageType: stringField(inner, "type") ?? "unknown",
    ...optionalField(
      "requestId",
      stringField(payload, "requestId") ?? stringField(inner, "requestId"),
    ),
    ...optionalField("subscriptionId", stringField(payload, "subscriptionId")),
    ...optionalField("cwd", stringField(payload, "cwd")),
  };
}

/** The error text that fails the refused message's request, so the window is not left waiting. */
export function relayFrameTooLargeError(bytes: number): string {
  return `Reply of ${bytes} B is too large for the relay (at most ${RELAY_MAX_PLAINTEXT_BYTES} B)`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(record: Record<string, unknown> | null, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

function optionalField<TKey extends string>(
  key: TKey,
  value: string | undefined,
): Partial<Record<TKey, string>> {
  return value === undefined ? {} : ({ [key]: value } as Record<TKey, string>);
}
