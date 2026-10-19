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

## How Groupon Desk ships it

Groupon Desk's release build (`scripts/desk-release/build.mjs` in `groupon2/engineering-development`,
pinned in `scripts/desk-release/fork.json` there) builds `packages/desktop` from a pinned commit of
this branch with `npm run build:desktop -- --publish never --mac dir --<arch>` and nests the result
in the menu-bar app as `Groupon Desk.app/Contents/Helpers/Groupon Desk Work.app`; Desk's "Work
window" button opens it. The app id is `com.groupon.desk.work`. Signing and notarisation come from
the environment that build sets (`CSC_NAME`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`,
`APPLE_API_ISSUER`; ad-hoc with `-c.mac.identity=-` on a local build). The app never checks Paseo's
update feed (`packages/desktop/src/features/auto-updater.ts`): Groupon Desk's own update replaces
both.
