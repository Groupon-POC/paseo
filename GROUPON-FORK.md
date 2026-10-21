<!-- Added for Groupon Desk (fork of Paseo, Apache-2.0). -->

# Groupon Desk, a fork of Paseo

This branch (`groupon`) is Groupon Desk's fork of [Paseo](https://github.com/getpaseo/paseo) by
Mohamed Boudra, licensed under Apache-2.0. `LICENSE` and its copyright line are unchanged. The fork
starts at Paseo's tag `v0.12.0` and is rebased onto Paseo's tags.

Every changed source file carries a first-line comment "Changed for Groupon Desk (fork of Paseo,
Apache-2.0): <what>", and every added file "Added for Groupon Desk". Files that cannot carry a
comment are listed here instead (Apache-2.0, section 4(b)):

| File                                                                                                                                                                                                   | What changed                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/app/package.json`, `package-lock.json`                                                                                                                                                       | `tweetnacl` as the app's own dependency: a colleague's device opens a shared workspace's key from the NaCl box the owner's hand made                                                                                                                                                                                  |
| `packages/server/package.json`, `packages/app/package.json` (development), `package-lock.json`                                                                                                         | `smol-toml`: the daemon reads and writes a project's config in `.groupon/desk.toml`; the app's end-to-end helpers write it                                                                                                                                                                                            |
| `paseo.json` (removed)                                                                                                                                                                                 | This repository's own worktree setup and scripts moved to `.groupon/desk.toml`                                                                                                                                                                                                                                        |
| `packages/desktop/package.json`                                                                                                                                                                        | `productName` Groupon Desk Work                                                                                                                                                                                                                                                                                       |
| `packages/app/eas.json`                                                                                                                                                                                | Paseo's App Store Connect id removed                                                                                                                                                                                                                                                                                  |
| `packages/app/public/manifest.json`                                                                                                                                                                    | The web app's name, short name Desk, description and icons (any and maskable)                                                                                                                                                                                                                                         |
| `packages/app/assets/images/icon.png`, `splash-icon.png`, `android-icon-foreground.png`                                                                                                                | The work window's icon, the Groupon G in curly braces `{ G }`, rendered from `packages/desktop/assets/brand/icon.svg`                                                                                                                                                                                                 |
| `packages/app/assets/images/notification-icon.png`                                                                                                                                                     | Groupon Desk's icon, rendered from the Desk's `AppIcon.png`                                                                                                                                                                                                                                                           |
| `packages/app/assets/images/favicon*.png` (the six status variants and `favicon.png`)                                                                                                                  | The `{ G }` on the green tile: `favicon-*.svg` (each marked in its first line) crop `packages/desktop/assets/brand/icon.svg` to its tile (viewBox `100 100 824 824`, no shadow), the status variants add Paseo's dot at the same place; rendered to 48 by 48 with `sharp`, `favicon.png` a copy of `favicon-dark.png` |
| `packages/app/public/apple-touch-icon.png`, `pwa-icon-192.png`, `pwa-icon-512.png`                                                                                                                     | The `{ G }` icon for the web app                                                                                                                                                                                                                                                                                      |
| `.oxfmtrc.json`, `.oxlintrc.json`                                                                                                                                                                      | `packages/app/public/mermaid-runtime.*.js` (a generated minified bundle) is in neither tool's scope                                                                                                                                                                                                                   |
| `packages/app/public/mermaid-runtime.<hash>.js`                                                                                                                                                        | Generated by `npm run build:mermaid-runtime` (`mermaid/build-runtime.mjs`): the Mermaid runtime of `html.gen.ts` as a script file, for a page whose policy forbids inline script (see the section on the strict policy below); the hash is in the name, and the build removes the previous file                       |
| `packages/desktop/assets/icon.icns`, `icon.ico`, `icon.png`, `icon-dev.png` (the Dock icon of a development run), `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png`, `brand/iconTemplate*.png` | The `{ G }` icon for macOS, Windows and Linux, rendered from `packages/desktop/assets/brand/icon.svg` and `icon-mono.svg`                                                                                                                                                                                             |

The other eight languages (`ar`, `es`, `fr`, `ja`, `ko`, `pt-BR`, `ru`, `zh-CN`) name Groupon Desk
wherever Paseo's name stood (2026-10-20); the rest of their text is Paseo's, and the Groupon
screens show English in every language.

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
  its disk image (`GROUPON_DESK_DOWNLOAD_URL`). The hub is re-read every 15 s on that screen, and for the
  whole window (`groupon/hub-sync.tsx`, so Your Macs and the `On <Mac>` picker never need a restart) every
  30 s while it is in the foreground, at once when it regains focus or visibility, and when a hub
  Mac's connection comes online or drops; a failed read keeps the last list and its error line.
  Your Macs and Settings show when the hub was last read ("updated 14:05") beside Refresh. The sidebar's and the settings'
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
  "connecting" or "different vault", and cannot be chosen. One row per Mac: keyed by its daemon's
  server id and the hub's machine id, named by the hub's alias or name, never by the label Paseo's
  host registry stored (two hub records naming one daemon are one Mac, in Your Macs too); a
  registry host no hub Mac stands behind is left out of a release build and listed as "stored
  host" only in a development build. Choosing a Mac is Paseo's host switch
  (`screens/new-workspace-screen.tsx`, `screens/new-workspace/form/index.tsx`), so the
  repository list, Local / Worktree and the started task belong to that Mac. Paseo's Host picker
  is not shown on New workspace.
- **"This computer", green, in every list of Macs** (owner, 2026-10-21: "I want to see better that
  it is this computer, as a green label"). The computer the window runs on carries a green label
  "This computer" right after its name (`groupon/this-computer-badge.tsx`, the model's `badge`),
  apart from the grey caption under the name (which no longer starts with "This Mac"): in New
  workspace's picker and its "On <Mac>" button, Add project and From GitHub, Your Macs, Improve
  this repository, and Start a ticket's subtitle. The other Macs carry none.
- **"+ New workspace" under every project's last workspace** (owner, 2026-10-21): the row Paseo
  draws only for a project with no workspace is drawn under the last workspace of a project that
  has some, the same look and action (`buildSidebarProjectChildrenModel`,
  `components/sidebar-workspace-list.tsx`).
- **Host on Add project and From GitHub: this Mac first, always.** Paseo's Add project went
  straight to the only connected host, so on a Mac whose hand was not running it offered another
  Mac and no way to add the project where the person sat (owner, 2026-10-21). Its first page is
  now the person's Macs from the hub (`groupon/add-to-mac-model.ts`, `groupon/add-to-mac.tsx`,
  `components/add-project-flow.tsx`): this Mac first, named by the hub, even while its hand is not
  running; then it is greyed with one sentence, "The hand on this Mac is not running. Press Work
  window in Groupon Desk, or run groupon desk serve install.", and a Copy button for the command;
  the other Macs follow, serving ones enabled, the rest greyed with "hand not running". The flow
  opens on the methods of the Mac the caller named, else of this Mac when it serves, with the list
  one Back away; never on another Mac only because it is the only one serving (the web build,
  which is on no Mac, opens on the one serving Mac). Search for directory and New directory follow
  the Mac chosen there. From GitHub's host step is the same list (`useOpenGithubProject`), always
  shown, with one line under it: "A repository clones on the Mac you choose; a Mac that already
  has it shows the path."; its folder step names every Mac that already has the repository, with
  its path, from the hub's checkouts. A row enables itself when the Mac's hand starts: the hub is
  read every 30 s, and while this Mac's row is greyed on screen its loopback is asked every 5 s
  for a daemon, the hub read again once one answers. The window knows which hub Mac it runs on
  without a daemon: the desktop app reads Groupon Desk's own id for this Mac
  (`groupon_this_machine`, `defaults read com.groupon.desk deskMachineId`, never written by the
  window), so New workspace's "On <Mac>" and Your Macs also name this Mac when its hand is off.
- **Project on New workspace: "Repository" instead, one repository on every Mac.** A project is a
  repository, the same one on every Mac (owner, 2026-10-20: "I am starting it inside a workspace,
  which is in effect always a GitHub repository, so I would expect the same thing to open on the
  other computer"). The field lists each repository once by its remote's `owner/name`, with the
  Macs that hold a checkout of it: Paseo's projects on every connected Mac merged with the hub's
  checkouts, which every Mac's hand reports (`GET /user/groupon_desk/work/overview`, re-read every
  minute); a folder with no remote stays listed under its Mac (`groupon/repository-picker-model.ts`,
  `groupon/repository-picker.tsx`). The page opens on the repository of where the person is (the
  group or workspace New workspace was pressed in, else the last workspace), else the repository
  chosen last time on this device, never on an empty field when one of these exists. The Mac
  follows the repository: this Mac when it holds it, else the first connected Mac that does; the
  "On <Mac>" list says per Mac where it holds the repository or that it does not, and choosing a
  Mac that lacks it opens From GitHub at the folder step of that repository on that Mac
  (`github-project-store.ts`' `prefill`), which closes back to New workspace after the clone. A
  checkout the hub reports on the chosen Mac that Paseo's daemon does not list yet is opened there
  as a project. While the chosen Mac lacks the repository, one line under the fields says so with
  "Clone it on <Mac>", and the page has no project (never another repository in its place). Paseo's
  own project pick (`screens/new-workspace/project-picker.ts`) is kept, unchanged, and driven onto
  the repository's project on the chosen Mac.
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
- **The model picker opens where there is room, and is never empty.** Visual pass 2026-10-21: on
  New workspace the picker opened upward and the window's top edge clipped it. The composer's
  model picker (`desktopPlacement="auto"` in `components/ui/combobox.tsx`) opens below its trigger
  when the trigger sits in the window's upper half, above it otherwise, and its height is capped
  to the room on that side so the list scrolls inside it (`groupon/popover-placement.ts`,
  `components/ui/combobox-frame-style.ts`). The form preselects the agent last used on this device
  (Paseo's form preferences, the source Improve this repository reads), else Claude, else the first
  agent this Mac can start, with the model used last for it, else the agent's default model; an
  agent this Mac cannot start is replaced the same way (`groupon/default-agent-selection.ts`,
  `provider-selection/resolve-agent-form.ts`).

## The web build under a strict Content Security Policy

`desk.livingsocial.com` and `desk.grpn.site` send `script-src 'self'` with no `'unsafe-inline'`
(Report-Only first, then enforced; the monorepo's `config/frontends/frontend-desk-ts/nginx.conf`
holds the policy). A `srcdoc` or `blob:` frame **inherits** its creator's policy, and a meta policy
inside the frame can only narrow it (measured in Chromium 2026-10-21: `srcdoc`, `blob:` with
`frame-src blob:`, `data:` and the `<iframe csp>` attribute all refused the frame's inline script).
So the two frames that ran inline script load differently when the page is served over http(s);
Electron's own scheme and the phone apps keep the old paths.

- **Mermaid diagrams** (`mermaid/iframe-runtime.web.tsx`, `mermaid/runtime/web-document.ts`): the
  frame is still a sandboxed `srcdoc`, but it loads the runtime as a file from the page's own origin
  (`public/mermaid-runtime.<hash>.js`, written by `build-runtime.mjs` beside `html.gen.ts`, which
  the Electron window and the native apps still use inline). The frame's own meta policy names that
  origin as its one script source (a sandboxed frame's `'self'` is opaque). Needs nothing from the
  server beyond the file.
- **HTML preview** (`file-pane/html-preview.web.tsx`, `file-pane/html-preview-frame.ts`): arbitrary
  agent-written HTML runs inline script, so it cannot be a `srcdoc` under this policy. The sandboxed
  frame loads `public/html-preview-frame.html`, which waits for the page's document by
  `postMessage` (from its parent only, once) and writes it in. That one path must be answered by the
  server with its own policy (`HTML_PREVIEW_FRAME_RESPONSE_POLICY`: the preview's own meta policy,
  plus `frame-ancestors 'self'`) and without `X-Frame-Options: DENY`; the deploy's nginx has a
  `location = /html-preview-frame.html` for it. A server without that location makes the browser
  refuse the frame; the preview then falls back to `srcdoc` about 2 seconds later (the markup shows,
  its scripts do not run under an enforced policy).
- **Markdown needs `'wasm-unsafe-eval'`.** The chat's markdown (`react-native-enriched-markdown`)
  compiles an md4c WebAssembly module in the page; under `script-src 'self'` alone every assistant
  message fails to render ("Aborted(CompileError: WebAssembly.instantiate() ... 'unsafe-eval' is not
  an allowed source"). The policy has to carry `'wasm-unsafe-eval'` in `script-src` (it allows
  WebAssembly compilation, not string evaluation).
- **What's new does not fetch.** `openChangelog()` opens nothing and `useChangelog` fetches nothing
  while `PASEO_WEB_LINKS` is off, so no request goes to `raw.githubusercontent.com`.
- **No localhost probe at boot.** `HostRuntimeStore.boot()` probed `localhost:6767` for a daemon
  whenever no host was named; the policy has no localhost, and no host is added by address
  (`PASEO_MANUAL_HOSTS` is off), so `createDefaultDeps` turns it off (`bootstrapDefaultLocalhost`).

## The web build is an installable app

`packages/app/public/manifest.json` (name "Groupon Desk", short name "Desk", `display: standalone`,
`start_url: /`, theme and background `#181B1A`, the `{ G }` icons at 192 and 512, each declared as
`any` and as `maskable`) and the head of `packages/app/public/index.html` (`apple-touch-icon` 180,
`apple-mobile-web-app-capable`, `mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`
`black-translucent`, `apple-mobile-web-app-title` Desk) make "Add to Home Screen" open it full screen.
A small card says so (`groupon/install-card.tsx`, its model `groupon/install-card-model.ts`): on
iOS Safari not yet installed, the three steps with the Share icon; on Android Chrome, an Install
button bound to the browser's `beforeinstallprompt` (`groupon/install-prompt.ts` keeps the event from
the moment the page loads). It sits under the gate's sign-in and vault steps with "Not now"
(remembered on the device, `installCardDismissed`) and in Settings > Groupon as Home screen, where
it has no dismissal so the steps stay reachable. Nothing shows in the Electron window, a phone app or a
desktop browser, nor once launched from the home screen (`navigator.standalone` or
`display-mode: standalone`). Installed, the browser keeps the site's storage, where Safari deletes a
site's data after seven days without a visit; the card's last line says it keeps the person signed in.
Launched from the home screen, the gate signs in by the device code and not by the redirect to the
SSO gateway (`launchedStandalone`), because a redirect out of an app window can return in the
browser's storage, not the app's.

## No trace of Paseo a person meets

The owner's word of 2026-10-20: "erase the traces of Paseo and have it all covered by our brand".
Attribution stays where the licence wants it (`LICENSE`, this file); everything a person reads
names Groupon Desk or nothing:

- **The name.** The packaged Electron app is "Groupon Desk Work" (`packages/desktop/src/app-name.ts`:
  the application menu, the About panel, the window title, a notification's title), the name of
  the bundle Groupon Desk nests (`productName` in `packages/desktop/package.json` and
  `packages/desktop/electron-builder.yml`); its state stays in the folder the earlier name gave it
  (`~/Library/Application Support/Groupon Desk`). The web app and the phone app are "Groupon Desk".
- **Paseo's web pages.** `PASEO_WEB_LINKS` (`groupon/paseo-web-links.ts`) is off: a docs link or
  button to paseo.sh (`components/ui/external-link.tsx`, the skills, daemon and changelog headers),
  the help menu's What's new (Paseo's changelog) and its Discord and GitHub issue entries, the
  startup error's GitHub and Docs buttons and the welcome screen's "Built on Paseo" draw nothing;
  the help menu's Report an issue offers Report a problem instead, the program's feedback board
  (`GROUPON_DESK_FEEDBACK_URL`), and the Rosetta callout downloads Groupon Desk's disk image.
  `PASEO_CLI_INSTALL` is off: Settings offers no install of Paseo's `paseo` command.
- **Words.** Every English string that named Paseo names Groupon Desk or no product, the other
  languages too; so do the texts the fork's server writes for a person (a generated pull request's
  body, the diagnostics, the self-update and setup-approval messages, the voice mode's prompt).

Kept on purpose, never seen by a person: the package names (`@getpaseo/*`), module paths, the
protocol's field and message names, environment variable names (`PASEO_*`), the agents' tool
descriptions, the engine's own log lines and process titles, and Linux-only packaging.

## A project's config: `.groupon/desk.toml`, never `paseo.json`

Paseo keeps a project's worktree setup, teardown, terminals and scripts in `paseo.json` at the
repository root. The fork reads and writes them in the repository file Groupon Desk already has,
`.groupon/desk.toml` (owner, 2026-10-20: no Paseo file in a repository, and no fallback to one), in
Paseo's shape as TOML: `[worktree]` (`setup`, `teardown`, `[[worktree.terminals]]`,
`[worktree.servicePorts]`), `[scripts.<name>]` (`command`, `type`, `port`) and
`[metadataGeneration.<kind>]`. The rest of the file is Groupon Desk's (`[scripts]`'s own keys
`setup`, `archive`, `run_mode` and `[scripts.run.*]`, `[prompts]`, `[git]`, `[encore]`, comments): the
daemon never reads it as Paseo config and a save from the Projects page keeps it byte for byte,
replacing only the work window's tables (`packages/server/src/utils/paseo-config-file.ts`). A
script cannot be named `setup`, `archive`, `run_mode` or `run`; another top-level key is never
written. A new worktree gets an uncommitted copy of the file the same way it got `paseo.json`.

## A workspace's branch and its pull request

Measured on the owner's Mac on 2026-10-20: a workspace started from New workspace with a plain
question sat on the repository's trunk, `staging`; the daemon matched it to the pull request
whose head is `staging` (the release train, `STG -> PRD`, its checks cancelled), so the sidebar
showed that pull request "failed", and auto-archive-on-merge archived the workspaces whenever an
earlier train merged. Two rules now hold:

- **A pull request belongs to a workspace's own branch, never to a trunk.** The shared trunks
  are `staging`, `production`, `main`, `master`, `develop`, the repository's default branch
  (`origin/HEAD`) and `.groupon/desk.toml`'s `[git] target_branch`
  (`packages/server/src/groupon/shared-trunk.ts`). A workspace on a trunk, or one whose
  pull-request lookup would land on a trunk, shows no pull request and no checks, is never polled
  for one, and auto-archive-on-merge never fires for it (`workspace-git-service.ts`'s
  `isOnSharedTrunk`, handed in by `bootstrap.ts`; `auto-archive-on-merge/archive-if-safe.ts`
  also refuses a merged pull request whose head is a trunk). A pull request from another owner's
  fork keeps matching: its head is that fork's branch.
- **A workspace started without a ticket gets its own branch from the start.** The window
  advertises the `groupon_workspace_placement` capability (`runtime/host-runtime.ts`) and the
  daemon then places it (`packages/server/src/groupon/workspace-placement.ts`, from
  `session.ts`'s `createRequestedWorkspace`): Local on a checkout that sits on a trunk becomes a
  worktree cut from that trunk, and a worktree that branches off without a name gets
  `<github login or unix user>/<slug of the first prompt, 40 characters>`
  (`groupon/workspace-branch.ts`: the login from `gh api user` on the repository's host, else
  the unix user; `-2`, `-3` when the name is taken here or on origin), kept as named (Paseo's
  rename after the first message is skipped). A workspace started empty is `<login>/<worktree
name>` until its first message renames it to `<login>/<slug of that message>`. Start a ticket's
  branch is named by `groupon ticket name` and never reaches this; an agent's own request
  (`callerAgentId`) and a background workspace keep Paseo's behaviour, and so does every client
  that does not advertise the capability (Paseo's CLI, its tests).

A pull request from a `<login>/<slug>` branch is renamed through `groupon ticket name` before it
opens: the company's branch standard is `<tribe>/<INITIATIVE-KEY>/<TICKET-KEY>-<slug>`, and the
pull-request prompt in the repository's `.groupon/desk.toml` already says so.

The workspaces the release trains archived before this are listed per Mac in Settings > Groupon,
"Archived by a release train" (`groupon/train-archived-section.tsx`), newest first with the archive
date, answered by the daemon (`groupon-desk.train-archived-workspaces`, a built-in RPC under the
plugin id `groupon-desk`, answered by `session.ts` itself, `packages/server/src/groupon/train-archived.ts`).
Two shapes of record are listed: every archived workspace whose own branch is a shared trunk
(`staging`, `production`, `main`, the repository's default branch, its base, desk.toml's target),
whatever the record says of a pull request, because the daemons of 2026-10-20 archived those
without keeping the address (measured 2026-10-21: three `staging` workspaces, none listed); and
every workspace on its own branch whose record keeps the merged pull request's address and whose
pull request had a trunk as head, asked of the forge once per pull request. Restore is Paseo's own
workspace recovery: it unarchives the record and recreates a removed worktree from its branch; a
branch that is gone too cannot be restored, and Restore says so. A removed worktree whose branch
was the trunk itself is recreated on a fresh branch `restored/<trunk>-<id>` cut from the trunk's
current head (origin's, fetched first; `trunkRestoreSource`, called from
`server/session/workspace-recovery/workspace-recovery-service.ts`), since the trunk is usually
checked out in the main checkout already.

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
both: Settings > About shows no release channel and no Check / Update, only
"Updates arrive with Groupon Desk", and the sidebar's update callout is not mounted
(`PASEO_APP_UPDATES`, `packages/app/src/groupon/app-updates.ts`).

## The window's scheme: `groupon-desk`

The packaged window serves its pages from its own scheme, `groupon-desk` (Paseo's is `paseo`), so
every call it makes carries the origin `groupon-desk://app`: Core's CORS allowlists name it, the
daemon allows it (`packages/server/src/server/bootstrap.ts`), and the hand's relay door must admit
it. The same scheme is the window's macOS URL scheme (`packages/desktop/electron-builder.yml`):
`groupon-desk://h/<server>/agent/<agent>` opens an agent, built and read by
`packages/protocol/src/agent-deep-link.ts` (`paseo agent open` hands it to the window). The
menu-bar app keeps its own `groupondesk` scheme, so the two never claim the same links. There is
no fallback: a `paseo://` page, origin or link is not served, allowed or read (owner, 2026-10-20:
nobody used the old one). Moving the origin also moved the window's local storage, so a window
built before the rename starts with empty settings once. Upstream's native mobile tests under
`packages/app/e2e/mobile/` still open `paseo://` links: they drive upstream's own iOS and Android
app (`sh.paseo.debug`), which this fork does not build; the fork's Expo scheme is `groupondesk`
(`packages/app/app.config.js`).

## The web build signs in by redirect, there and back

On `desk.livingsocial.com` and `desk.grpn.site` the gate's Sign in moves the tab to Groupon's SSO
gateway and back, the way every Groupon frontend signs in (owner, 2026-10-21: the device code's
second tab had to be closed by hand on a phone). `packages/app/src/groupon/sso-redirect.ts` copies
the monorepo's `@groupon2/frontend-sso-client` contract, which the Expo build cannot import: a PKCE
verifier and state kept in the tab's sessionStorage, the gateway's `/auth-gateway?return_url=
<origin>/sso/callback&state=...&code_challenge=...&code_challenge_method=S256`, then
`POST /auth/authentication/sso/exchange` with `{ code, codeVerifier }` at the Core the flow began on.
The gateway follows the Core (production `sso.livingsocial.com`, staging `sso.grpn.site`, a local
Core's slot), never the host the window is served from. `session.ts`' `finishSsoRedirect` runs
before the gate hydrates, keeps the session where the device sign-in keeps it, takes the code out of
the address bar, and the route `src/app/sso/callback.tsx` sends the router to the page Sign in was
pressed on; the vault step follows as before. Core admits a return origin only from its
`SSO_ALLOWED_ORIGINS` (the estate table's frontends, both environments, `desk` included), and the
gateway shows its own error page on a refused one without coming back, so the redirect is offered
only on those two origins (and loopback against a local Core); the Electron window, a phone app and
any other host keep the device code, and the card's "Sign in with a code instead" reaches it too.

## The window signs in with this Mac's sign-in

Groupon Desk and the `groupon` CLI keep one sign-in per Mac, in the CLI's credentials file
(`$XDG_CONFIG_HOME/groupon/credentials`, else `~/.config/groupon/credentials`; the monorepo's
`packages/groupon-cli/src/auth/storage.ts`), and the hand keeps it renewed. The packaged window
opens on it instead of asking for Google again: its main process reads the production entry
(`packages/desktop/src/features/groupon-desk-session.ts`) and hands the renderer the access token
and its expiry through one preload call, `window.grouponDesk.readDeskSession()`, answered only to
the window's own pages (`groupon-desk://app`, and the dev server in a development run). When the
file's access token is about to lapse, the main process renews it under the CLI's lock
(`credentials.refresh.lock`) and writes it back in the CLI's format, as the CLI and the hand do;
the renderer never holds the refresh token, never renews this session and never stores it
(`packages/app/src/groupon/mac-session.ts`, `session.ts`): Core rotates the refresh token on every
renewal and revokes the whole session when a used one comes back, so a second renewer would sign
the Mac out. The window's own session, when it has one that can still be renewed, comes first.
Signing out in the window clears the window's own storage only (Settings says so); the Mac stays
signed in, and the window takes its sign-in again the next time it opens. With no production entry
in the file, the gate shows Google sign-in as before; the web build and the phone have no bridge
and sign in as before. The vault passphrase is not typed again either: when the window keeps no vault key,
a second preload call, `window.grouponDesk.readDeskVaultKey()`, has the main process read the key
Groupon Desk and its hand keep in the login keychain (`packages/desktop/src/features/groupon-desk-vault-key.ts`:
service `com.groupon.desk.vault-key`, account the user id of the Mac's sign-in, through
`/usr/bin/security`, read only, never logged), and the window keeps it in its own storage as if
typed, but only for the same person and only once it opens the hub's vault. A Mac without a kept
key shows the passphrase step as before.

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

A workspace made in the window reaches the hub through the Mac's hand, which mirrors every
workspace of its daemon (design section 5.1); the hub's row carries the daemon's `serverId` and
workspace id. The window finds the hub row of a Paseo workspace by that pair
(`hubWorkspaceForDaemon` in `groupon/share-model.ts`), else by its folder on that daemon's Mac, so
Share, the presence check-in (`groupon/presence-row.tsx`) and who wrote what work for it too. Until
the Mac has mirrored a workspace made a moment ago, the presence row re-reads the overview every
15 s and the Share sheet says the Mac adds it within half a minute, re-reading every 15 s while
open so it flips by itself.

Who wrote what (the owner's word of 2026-10-21). A user message carries an optional author,
`{ userId, name, device? }` (`UserMessageAuthor` in `packages/protocol/src/agent-types.ts`, on
`send_agent_message_request` and on the timeline's `user_message`; a peer without it ignores it).
The window sends the signed-in person (`groupon/message-author-source.ts`, registered by the gate);
the hand sends the colleague the hub's command names for a shared prompt. The daemon keeps it on
the user_message it records (`AgentManager.notePromptAuthor`), in memory only: a daemon restart
rebuilds the timeline from the provider's history, and those messages come back with no author.
The chat draws four looks (`groupon/message-author-model.ts`, `message-author.tsx`): your own
prompts in Paseo's bubble, a colleague's on the left in the theme's `colleagueMessage` tint (the accent at 16 percent, `styles/theme.ts`) with a name chip
("Carl Colleague · Mac app"), a message another agent sent through the hub (monorepo design section 19: the author's
`device` is `"agent"`, its name "<workspace title> (agent)") on the left in the theme's `agentMessage`
tint (violet at 16 percent with a 45 percent border, a shade per scheme, `styles/theme.ts`) with a bot
icon on the name chip, whoever's user id it carries; the agent's answers as before; a message with
no author is the workspace owner's. The History reader takes the author from the hub's `senderUserId` and the device
the colleague's window seals into the prompt; the Share screen carries the legend (you / colleague / another agent / this agent).

## My tasks on the New workspace page

Under the composer of the New workspace page (`screens/new-workspace-screen.tsx`, one marked line
mounting `groupon/jira-tasks-card.tsx`), a card lists the person's Jira tasks: a filter bar
modelled on Jira's (Assignee = Current user, Type, Status, Created in the last N days, More
filters as free JQL, Clear filters; `groupon/jira-tasks-filters.tsx`), the table with the person's
columns (Jira's own nine by default, picked in `groupon/jira-tasks-columns.tsx`), paging, and as
the last column "Take to development", which opens Start a ticket with that key. Every change is
saved, after a pause, as the person's default view on the internal plane, so every window opens
the same. The Groupon plugin on the page's Mac answers `groupon.jira-search`,
`groupon.jira-fields` and `groupon.jira-saved-view` through that Mac's `groupon` CLI; the filter
bar's JQL and its reading back are `groupon/jira-tasks-model.ts`. Not drawn on a phone-sized
layout, where the composer sits at the bottom.

## Your access and the Standards page

The home page (`screens/open-project-screen.tsx`) carries Your access beside its tiles on a wide
window and above them on a narrow one (`groupon/home-access.tsx`, its words in
`groupon/home-access-model.ts`): every Encore app the platform hands out with the person's standing
and Ask for access (the plugin's `groupon.encore-apps` and `groupon.encore-request-access`), and per
GitHub host the organisations and teams the person is in, the command that signs gh in where it is
not, and the admin's page where access is asked for (`groupon.github-access`). Both are read by the
Groupon plugin on the Mac the window runs beside (else the first Mac), on open and every minute.
A Standards tile opens Settings > Standards (`groupon/standards-page.tsx`, `groupon/standards-model.ts`):
the engineering standards of the repository picked, read from the repository itself by the plugin
(`groupon.standards`: `.standards/` after `groupon standards pull`, else the repository's own
`_documentation/engineering-standards/`), the branch-name and pull-request standards first, rendered
with the file pane's markdown preview, and Pull the standards, which runs `groupon standards pull`
in that checkout. A repository without standards says so and points at `groupon standards adopt`.

## The environment badge, in the sidebar

The web build's shell (`apps/frontend-desk-ts` in the Groupon monorepo) mounts the monorepo's
floating environment badge (`@groupon2/frontend-environment-badge`, bottom-right); on
`desk.grpn.site` it covered the composer's right-hand controls at desktop and phone width (visual
pass 2026-10-21). The window hides it on the web (`groupon/environment-badge-model.ts`,
`hideShellEnvironmentBadge`, from the gate) and draws its own as a row of the sidebar
(`groupon/environment-badge.tsx`): in the footer on a wide window, beside the close button in the
header on a phone, never over the page. A release build that offers no choice of Core draws none (it
signs in to production alone, the staging host included); a build that offers the choice
(`environmentChoiceOffered`) shows STAGING or LOCAL while that Core is chosen, with Open PROD on the
web, which opens the same page on `desk.livingsocial.com`.

## Connected computers, in the sidebar

Above the subscriptions' limits at the bottom of the sidebar (owner, 2026-10-21; WW-87), the
person's Macs from the same hub list as Your Macs and New workspace's Mac picker
(`groupon/connected-computers.tsx`, `groupon/connected-computers-model.ts`, mounted in
`components/left-sidebar.tsx`'s footer): this computer first with the green "This computer", a
green dot on a Mac online (its hand sent a load sample within 60 s, or the window holds a live
connection to its daemon), and on pressing a Mac its CPU and RAM in use as quiet bars in the limits
panel's style. The hand sends the sample every 10 s (monorepo design section 4b); while a Mac is
open the section reads `/user/groupon_desk/machines` again every 10 s, otherwise the shared list's
30 s cadence holds.

A Mac whose hand cannot find a tool carries small amber labels ("gh missing") on its row, here and
in New workspace's Mac picker, and on expanding it one sentence: "Install it on that Mac: brew
install gh, then gh auth login" (WW-92). The hand checks `gh`, `git`, `claude` and `codex` in the
PATH it gives its daemon, at start and every hour, and sends the list as the hub's `missingTools`
(`groupon/missing-tools-model.ts`, `missing-tool-labels.tsx`). `codex` is the optional one: it is
labelled only on a Mac a Codex session runs on (`groupon/codex-servers.ts`, read from the agents
the app already holds). An older hand or Core sends no list and the Mac shows no label.

## Improve this repository

The owner's word of 2026-10-20: "a solution for 'How to improve my repository', where a prompt
starts on how to tune a repository so that it adapts easily to a person". One sheet
(`groupon/improve-repository-sheet.tsx`, its rules in `groupon/improve-repository-model.ts`, opened
through `groupon/improve-repository-store.ts`) is reached three ways: the home page's Improve this
repository tile, the sidebar repository row's menu, and a button on the Projects page. It shows the
repository (preselected from where it was opened, else where the person is, else the repository
chosen last, as New workspace does), the Macs that hold it (only one whose hand is running can be
chosen, the guard of New workspace's Mac picker and Start a ticket), a read-only preview of what the
agent will do, and Start. Start creates a workspace on that Mac in a fresh worktree,
`improve-repository`, cut from the default branch, with the agent and model New workspace used last
(else a Claude agent), and sends one prompt: the repository's own `[prompts] improve_repository`
from `.groupon/desk.toml` (read through the plugin's `groupon.project-settings`, which passes every
`[prompts]` key through), else the window's default, `GROUPON_IMPROVE.defaultPrompt` in
`groupon/strings.ts`: `groupon standards adopt` and `groupon standards pull`, `.groupon/desk.toml`,
one command each to set up, run and validate with a short Start here, file headers, and one pull
request by the repository's own convention, never merged. The workspace then shows as any other. The home tile, opened from nowhere in
particular, preselects like the rest: the last workspace's repository, else the repository chosen
last, else the first repository a serving Mac holds (this Mac first), and its Mac by the sheet's own
rule, so Start is never greyed for want of a choice the window could make.

## Folders are browsed, not typed

The owner's word of 2026-10-21: "here I cannot even browse folders normally like a person, I have
to type like a robot". Choose parent directory (New directory), Search for directory, Paseo's
Choose destination and From GitHub's clone folder browse the chosen Mac's folders a click at a
time (`groupon/folder-browser.tsx`, its rules in `groupon/folder-browser-model.ts`; the palette is
`components/add-project-flow.tsx`, its pages keep the folder looked at in
`add-project-flow/model.ts`). The browser opens at that Mac's home folder with the usual places
first (`~/Documents/GitHub`, `~/Developer`, `~/Desktop`, `~/Documents`, those that exist, then
every folder that holds a checkout the window knows of on that Mac: its daemon's projects and the
hub's checkouts), then the folder's subfolders alphabetically, a git checkout marked, dot folders
and macOS's `~/Library` folded behind one "Show N hidden folders" row. A breadcrumb (Home ›
Documents › GitHub) goes up, and so does Backspace in an empty field; Enter or a click goes into a
folder; Choose this folder (or Cmd/Ctrl+Enter, or Enter in an empty folder) picks the folder
looked at. The field still takes a path, and filters as it is typed: a word narrows the folder's
subfolders (Search for directory also lists matches from the whole home folder below them), a path
lists its parent narrowed to its last part (`~/Doc`), or the folder itself once it ends in `/`. In
the Electron window and for this Mac only, Browse… (Finder) opens the native folder dialog through
the preload's existing `dialog.open` (`openDirectory`), and the folder picked becomes the folder
looked at; on the web, on a phone and for another Mac the button is not drawn.

The daemon answers one folder at a time as the built-in RPC `groupon-desk.list-directory`
(`packages/server/src/groupon/list-directory.ts`, plugin id `groupon-desk`, answered by
`session.ts` itself), so a remote Mac answers through the relay like this one: input `{ path }`
(`~`, `~/…`, absolute, or relative to home), output the folder, its home, its parent (null at
home), its subfolders with `hidden` and `gitCheckout` flags (at most 2,000, `truncated` beyond),
the usual places that exist, and `error` as a sentence rather than a throw. It never lists a
folder whose real path (symlinks resolved) is outside the daemon user's home, and never reads
under `~/Library` on macOS, where readdir can block forever on a privacy prompt the daemon cannot
show.
