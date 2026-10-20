// Added for Groupon Desk (fork of Paseo, Apache-2.0): Paseo's pairing offers, manual hosts and built-in daemon are not offered in Groupon Desk.

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

/**
 * Whether Groupon Desk's hand owns this Mac's daemon. On in every build (owner, 2026-10-20; the
 * monorepo's design `groupon-desk-work-window-design.md`, sections 12a and 12b): the daemon starts
 * only by the hand (`groupon desk serve`, a launchd agent), which registers it on Core's relay; the
 * window finds the person's Macs through the hub, connects directly to this Mac's daemon and
 * through the relay to the others, and never runs a daemon of its own. So the window never starts
 * Paseo's built-in daemon at launch, retries none, shows no "Manage built-in daemon" or "Enable
 * built-in daemon" controls, and does not poll the desktop for one. The desktop's main process
 * carries the same switch (`packages/desktop/src/daemon/groupon-local-daemon.ts`) and refuses a
 * start even if asked.
 */
export const GROUPON_DESK_HAND_OWNS_DAEMON = true;
