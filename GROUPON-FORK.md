<!-- Added for Groupon Desk (fork of Paseo, Apache-2.0). -->

# Groupon Desk, a fork of Paseo

This branch (`groupon`) is Groupon Desk's fork of [Paseo](https://github.com/getpaseo/paseo) by
Mohamed Boudra, licensed under Apache-2.0. `LICENSE` and its copyright line are unchanged. The fork
starts at Paseo's tag `v0.12.0` and is rebased onto Paseo's tags.

Every changed source file carries a first-line comment "Changed for Groupon Desk (fork of Paseo,
Apache-2.0): <what>", and every added file "Added for Groupon Desk". Files that cannot carry a
comment are listed here instead (Apache-2.0, section 4(b)):

| File                                                                                                                                                                         | What changed                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `packages/app/eas.json`                                                                                                                                                      | Paseo's App Store Connect id removed                        |
| `packages/app/public/manifest.json`                                                                                                                                          | The web app's name and description                          |
| `packages/app/assets/images/icon.png`, `splash-icon.png`, `android-icon-foreground.png`, `notification-icon.png`, `favicon*.png` (the six status variants and `favicon.png`) | Groupon Desk's icon, rendered from the Desk's `AppIcon.png` |
| `packages/app/public/apple-touch-icon.png`, `pwa-icon-192.png`, `pwa-icon-512.png`                                                                                           | The same icon for the web app                               |

The other eight languages (`ar`, `es`, `fr`, `ja`, `ko`, `pt-BR`, `ru`, `zh-CN`) are not changed:
they still name Paseo where the English names Groupon Desk, and the Groupon screens show English
in every language.
