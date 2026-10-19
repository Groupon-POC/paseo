<!-- Added for Groupon Desk (fork of Paseo, Apache-2.0). -->

# Groupon Desk, a fork of Paseo

This branch (`groupon`) is Groupon Desk's fork of [Paseo](https://github.com/getpaseo/paseo) by
Mohamed Boudra, licensed under Apache-2.0. `LICENSE` and its copyright line are unchanged. The fork
starts at Paseo's tag `v0.12.0` and is rebased onto Paseo's tags.

Every changed source file carries a first-line comment "Changed for Groupon Desk (fork of Paseo,
Apache-2.0): <what>", and every added file "Added for Groupon Desk". Files that cannot carry a
comment are listed here instead (Apache-2.0, section 4(b)):

| File                                                                                                                                                                                                   | What changed                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/package.json`                                                                                                                                                                        | `productName` Groupon Desk                                                                                                |
| `packages/app/eas.json`                                                                                                                                                                                | Paseo's App Store Connect id removed                                                                                      |
| `packages/app/public/manifest.json`                                                                                                                                                                    | The web app's name and description                                                                                        |
| `packages/app/assets/images/icon.png`, `splash-icon.png`, `android-icon-foreground.png`                                                                                                                | The work window's icon, the Groupon G in curly braces `{ G }`, rendered from `packages/desktop/assets/brand/icon.svg`     |
| `packages/app/assets/images/notification-icon.png`, `favicon*.png` (the six status variants and `favicon.png`)                                                                                         | Groupon Desk's icon, rendered from the Desk's `AppIcon.png`                                                               |
| `packages/app/public/apple-touch-icon.png`, `pwa-icon-192.png`, `pwa-icon-512.png`                                                                                                                     | The `{ G }` icon for the web app                                                                                          |
| `packages/desktop/assets/icon.icns`, `icon.ico`, `icon.png`, `icon-dev.png` (the Dock icon of a development run), `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png`, `brand/iconTemplate*.png` | The `{ G }` icon for macOS, Windows and Linux, rendered from `packages/desktop/assets/brand/icon.svg` and `icon-mono.svg` |

The other eight languages (`ar`, `es`, `fr`, `ja`, `ko`, `pt-BR`, `ru`, `zh-CN`) are not changed:
they still name Paseo where the English names Groupon Desk, and the Groupon screens show English
in every language.

## What the fork takes off Paseo's screens

Paseo's code for these stays, so a rebase onto a new tag stays small; only the way to it is gone.

- **Clone from GitHub.** Add project offers one GitHub way, the fork's From GitHub
  (`packages/app/src/groupon/github-project-sheet.tsx`): the person's Groupon organisations, teams
  and repositories, opening on the organisation and team picked last time, cloned with `gh` into
  the Mac's checkout folder and added as a normal project. `components/add-project-flow.tsx`
  filters Paseo's `github` method out of the menu.
- **Pair device and pairing offers.** A phone reaches a Mac through Core once signed in with the
  same Google account, so Settings shows Your phone (`groupon/phone-section.tsx`: the work window's
  web address per environment, `GROUPON_DESK_WEB_URL`, and its QR code) where Paseo had Pair
  device, and no screen shows, exports or takes a pairing offer: `PASEO_PAIRING_OFFERS`
  (`groupon/pairing-policy.ts`) hides the QR scan and the pasted pairing link among the ways to add
  a host and on the welcome screen, and the direct form no longer takes a relay link.
- **The Core a fresh install starts on.** Production in every release build, the web build
  included; the local Core only in a development bundle (`defaultEnvironmentId`).
