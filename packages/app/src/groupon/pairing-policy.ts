// Added for Groupon Desk (fork of Paseo, Apache-2.0): Paseo's pairing offers and manual hosts are not offered in Groupon Desk.

/**
 * Whether the app offers Paseo's pairing: a QR code or a `#offer=` / `relay://` link that adds a
 * host. Off in Groupon Desk (owner, 2026-10-19): a person signs in with their Google account and
 * reaches their Macs through Core, so no screen offers the QR scan, the pasted pairing link or a
 * relay link typed into the direct form. Paseo's own offer handling stays in the code, out of
 * reach of the screens.
 */
export const PASEO_PAIRING_OFFERS = false;

/**
 * Whether the app offers Paseo's manual hosts: the welcome screen's Direct connection, the Add
 * host menu (direct, SSH, pairing link), its modals, and every "Add host" entry in the sidebar,
 * the settings and the add-project flow. Off in Groupon Desk, every build (owner, 2026-10-20: "we
 * will not let people connect anywhere but to their own signed-in devices"; there are no public
 * addresses to type). The person's Macs come from the hub alone (`hub-sync.tsx`), and the welcome
 * screen is Your Macs (`your-macs-screen.tsx`); an Add host link anywhere leads there.
 */
export const PASEO_MANUAL_HOSTS = false;
