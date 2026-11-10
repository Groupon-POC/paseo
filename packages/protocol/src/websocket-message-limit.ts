// Changed for Groupon Desk (fork of Paseo, Apache-2.0): the relay frame is Groupon Desk's 8 MiB, not upstream's 32 MiB.
/** Largest WebSocket message the daemon accepts. A bigger one closes the connection with 1009. */
export const MAX_WEBSOCKET_MESSAGE_BYTES = 100 * 1024 * 1024;

/**
 * Largest encrypted frame the relay accepts: Groupon Desk's relay (Core's `PASEO_RELAY_MAX_FRAME_BYTES`
 * and the relay door) takes 8 MiB, not upstream's 32 MiB. Every size check sized against the relay
 * reads this, so a reply too big for one frame is cut down instead of closing the connection (ENC-12144).
 */
export const MAX_RELAY_WEBSOCKET_MESSAGE_BYTES = 8 * 1024 * 1024;
