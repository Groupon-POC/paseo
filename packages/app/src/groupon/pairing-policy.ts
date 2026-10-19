// Added for Groupon Desk (fork of Paseo, Apache-2.0): Paseo's pairing offers are not offered in Groupon Desk.

/**
 * Whether the app offers Paseo's pairing: a QR code or a `#offer=` / `relay://` link that adds a
 * host. Off in Groupon Desk (owner, 2026-10-19): a person signs in with their Google account and
 * reaches their Macs through Core, so the ways to add a host keep the direct connection (and SSH
 * in the desktop app) and drop the QR scan, the pasted pairing link and a relay link typed into
 * the direct form. Paseo's own offer handling stays in the code, out of reach of the screens.
 */
export const PASEO_PAIRING_OFFERS = false;
