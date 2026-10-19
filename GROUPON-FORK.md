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
- **The Core a fresh install starts on.** Production in every release build, the web build
  included; the local Core only in a development bundle (`defaultEnvironmentId`).

## How Groupon Desk ships it

Groupon Desk's release build (`scripts/desk-release/build.mjs` in `groupon2/engineering-development`,
pinned in `scripts/desk-release/fork.json` there) builds `packages/desktop` from a pinned commit of
this branch with `npm run build:desktop -- --publish never --mac dir --<arch>` and nests the result
in the menu-bar app as `Groupon Desk.app/Contents/Helpers/Groupon Desk Work.app`; Desk's "Work
window" button opens it. The app id is `com.groupon.desk.work`. Signing and notarisation come from
the environment that build sets (`CSC_NAME`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`,
`APPLE_API_ISSUER`; on a local build ad-hoc with `-c.mac.identity=-` and without the hardened runtime, `-c.mac.hardenedRuntime=false`, since ad-hoc code under it cannot load Electron Framework). The app never checks Paseo's
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
