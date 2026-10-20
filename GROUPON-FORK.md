<!-- Added for Groupon Desk (fork of Paseo, Apache-2.0). -->

# Groupon Desk, a fork of Paseo

This branch (`groupon`) is Groupon Desk's fork of [Paseo](https://github.com/getpaseo/paseo) by
Mohamed Boudra, licensed under Apache-2.0. `LICENSE` and its copyright line are unchanged. The fork
starts at Paseo's tag `v0.12.0` and is rebased onto Paseo's tags.

Every changed source file carries a first-line comment "Changed for Groupon Desk (fork of Paseo,
Apache-2.0): <what>", and every added file "Added for Groupon Desk". Files that cannot carry a
comment are listed here instead (Apache-2.0, section 4(b)):

| File                                                                                                                                                                                                   | What changed                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/app/package.json`, `package-lock.json`                                                                                                                                                       | `tweetnacl` as the app's own dependency: a colleague's device opens a shared workspace's key from the NaCl box the owner's hand made |
| `packages/desktop/package.json`                                                                                                                                                                        | `productName` Groupon Desk                                                                                                           |
| `packages/app/eas.json`                                                                                                                                                                                | Paseo's App Store Connect id removed                                                                                                 |
| `packages/app/public/manifest.json`                                                                                                                                                                    | The web app's name and description                                                                                                   |
| `packages/app/assets/images/icon.png`, `splash-icon.png`, `android-icon-foreground.png`                                                                                                                | The work window's icon, the Groupon G in curly braces `{ G }`, rendered from `packages/desktop/assets/brand/icon.svg`                |
| `packages/app/assets/images/notification-icon.png`, `favicon*.png` (the six status variants and `favicon.png`)                                                                                         | Groupon Desk's icon, rendered from the Desk's `AppIcon.png`                                                                          |
| `packages/app/public/apple-touch-icon.png`, `pwa-icon-192.png`, `pwa-icon-512.png`                                                                                                                     | The `{ G }` icon for the web app                                                                                                     |
| `packages/desktop/assets/icon.icns`, `icon.ico`, `icon.png`, `icon-dev.png` (the Dock icon of a development run), `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png`, `brand/iconTemplate*.png` | The `{ G }` icon for macOS, Windows and Linux, rendered from `packages/desktop/assets/brand/icon.svg` and `icon-mono.svg`            |

The other eight languages (`ar`, `es`, `fr`, `ja`, `ko`, `pt-BR`, `ru`, `zh-CN`) are not changed:
they still name Paseo where the English names Groupon Desk, and the Groupon screens show English
in every language.

## What the fork takes off Paseo's screens

Paseo's code for these stays, so a rebase onto a new tag stays small; only the way to it is gone.

- **Clone from GitHub.** Add project offers one GitHub way, the fork's From GitHub
  (`packages/app/src/groupon/github-project-sheet.tsx`): on github.com or on Groupon's GitHub
  Enterprise (`github.groupondev.com`), switched at the top, the person's organisations, teams and
  repositories (on the enterprise also any other organisation, found by name), opening on the host,
  organisation and team picked last time, cloned with `gh` from that host into the Mac's checkout
  folder and added as a normal project. A host `gh` is not signed in to shows the command that
  signs it in. `components/add-project-flow.tsx`
  filters Paseo's `github` method out of the menu.
- **Pair device and pairing offers.** A phone reaches a Mac through Core once signed in with the
  same Google account, so Settings shows Your phone (`groupon/phone-section.tsx`: the work window's
  web address per environment, `GROUPON_DESK_WEB_URL`, and its QR code) where Paseo had Pair
  device, and no screen shows, exports or takes a pairing offer: `PASEO_PAIRING_OFFERS`
  (`groupon/pairing-policy.ts`) hides the QR scan and the pasted pairing link among the ways to add
  a host and on the welcome screen, and the direct form no longer takes a relay link.
- **Direct connection, Add host and SSH: Your Macs instead.** No host is added by hand in any
  build (owner, 2026-10-20: a person connects only to their own signed-in devices; there are no
  public addresses). `PASEO_MANUAL_HOSTS` (`groupon/pairing-policy.ts`) is off: the welcome screen
  is Your Macs (`groupon/your-macs-screen.tsx`, its model `groupon/your-macs-model.ts`), the
  person's Macs from the hub with the `{ G }` mark on top; a Mac whose hand is on Core's relay, or
  this Mac when its daemon answers directly, opens on tap, and the window goes to it by itself the
  moment one is online; a Mac without a running hand says so in one sentence (press Work window
  in Groupon Desk there, or `groupon desk serve install`); when every listed Mac is in that state,
  one line above the list says the Macs are signed in but none is serving; only with no Mac on the
  hub at all does the screen say Groupon Desk is probably not installed and connected yet and link
  its disk image (`GROUPON_DESK_DOWNLOAD_URL`). The hub is re-read every 15 s. The sidebar's and the settings'
  host pickers have no Add host option (`components/hosts/host-picker.tsx`), the settings with no
  host show Your Macs where Paseo had Add host and never mount the add-host modals
  (`screens/settings-screen.tsx`), and every other "Add host" link (`buildSettingsAddHostRoute`,
  the add-project flow with no host) opens Your Macs. Paseo's `add-host-modal.tsx`,
  `add-host-method-modal.tsx` and `add-remote-ssh-host-modal.tsx` stay, unreachable; Paseo's
  end-to-end specs that drive them (`e2e/`) do not apply to this fork.
- **Host on New workspace: "On <Mac>" instead.** Beside the repository dropdown, New workspace
  always shows which Mac the workspace and its agent start on, even with one Mac (owner,
  2026-10-20: "I do not understand where I choose on which computer it runs"). The list is the
  person's Macs from the hub (`groupon/mac-picker.tsx`, its model `groupon/mac-picker-model.ts`),
  this Mac first and chosen by default unless the route names a project; a Mac that is not
  connected (Your Macs' notion) is listed greyed with the reason, "hand not running",
  "connecting" or "different vault", and cannot be chosen. Choosing a Mac is Paseo's host switch
  (`screens/new-workspace-screen.tsx`, `screens/new-workspace/form/index.tsx`), so the
  repository list, Local / Worktree and the started task belong to that Mac. Paseo's Host picker
  stays for a host that no hub Mac names.
- **Paseo's built-in daemon: the hand owns it.** The daemon on a Mac starts only by Groupon
  Desk's hand (`groupon desk serve`, a launchd agent), which registers it on Core's relay; the
  window never runs one of its own (owner, 2026-10-20; the monorepo's design
  `groupon-desk-work-window-design.md`, sections 12a and 12b). `GROUPON_DESK_HAND_OWNS_DAEMON`
  (`groupon/pairing-policy.ts`) keeps the app from starting Paseo's built-in daemon at launch or
  on retry (`app/_layout.tsx`), from polling the desktop for one (`hooks/use-is-local-daemon.ts`),
  and from offering Enable or Manage built-in daemon; the desktop's main process carries the same
  switch (`packages/desktop/src/daemon/groupon-local-daemon.ts`): it refuses
  `start_desktop_daemon` and `restart_desktop_daemon`, answers `desktop_daemon_status` as stopped
  without launching Paseo's CLI, and looks for this Mac's daemon in the hand's home
  (`~/.groupon/paseo`) alone, never in `~/.paseo`.
- **The Core a fresh install starts on.** Production in every release build, the web build
  included; the local Core only in a development bundle (`defaultEnvironmentId`).

## How Groupon Desk ships it

Groupon Desk's release build (`scripts/desk-release/build.mjs` in `groupon2/engineering-development`,
pinned in `scripts/desk-release/fork.json` there) builds `packages/desktop` from a pinned commit of
this branch with `npm run build:desktop -- --publish never --mac dir --<arch>` and nests the result
in the menu-bar app as `Groupon Desk.app/Contents/Helpers/Groupon Desk Work.app`; Desk's "Work
window" button opens it. The app id is `com.groupon.desk.work`. Signing and notarisation come from
the environment that build sets (`CSC_NAME`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`,
`APPLE_API_ISSUER`; on a local build ad-hoc with `-c.mac.identity=-` and without the hardened runtime, `-c.mac.hardenedRuntime=false`, since ad-hoc code under it cannot load Electron Framework). A child the app starts in node
mode (Paseo's CLI) runs as the bundle's Helper, which carries `LSUIElement`
(`packages/desktop/src/daemon/runtime-paths.ts`): the Helper is named after `productName`
("Groupon Desk Helper.app") while the executable keeps Paseo's name, and a child started from the
main executable instead checks in with LaunchServices as a Foreground app the moment it sets
`process.title` (Paseo's supervisor and daemon do), so each got its own bouncing Dock tile. The app never checks Paseo's
update feed (`packages/desktop/src/features/auto-updater.ts`): Groupon Desk's own update replaces
both.

## Sharing a workspace with a colleague

The monorepo's design section 13 (`_documentation/design/groupon-desk-work-window-design.md`): a
workspace on the hub is shared with a colleague, to read or to write, through the hub alone,
never through the owner's daemon. The app publishes the person's identity (an X25519 pair from the
vault key, `groupon/crypto.ts`) when the vault opens; "Share…" on a workspace's menu in the sidebar
(`components/sidebar/sidebar-workspace-menu.tsx`, the item in `groupon/share-menu-item.tsx`) and on
the History screen's workspace card opens `groupon/share-screen.tsx` (who has access, Revoke);
"Shared with me" sits above the sidebar's footer (`components/left-sidebar.tsx`,
`groupon/shared-sidebar.tsx`) and on the History screen, and a shared chat opens in the History
reader with the share key out of the owner's box, with a composer and Allow / Deny when the role is
write (`groupon/history-chat-screen.tsx`, `groupon/share-model.ts`).
