// Changed for Groupon Desk (fork of Paseo, Apache-2.0): a relay URL naming the signed-in Core goes over Core's relay stream.
import { defaultWebSocketFactory } from "@getpaseo/client/internal/daemon-client-websocket-transport";
import type { WebSocketFactory } from "@getpaseo/client/internal/daemon-client-transport-types";
import { withCoreRelay } from "@/groupon/core-relay";

export function createAppWebSocketFactory(): WebSocketFactory {
  return withCoreRelay(defaultWebSocketFactory);
}
