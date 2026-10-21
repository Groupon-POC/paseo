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
| `packages/app/public/manifest.json`                                                                                                                                                                    | The web app's name and description                                                                                                                                                                                                                                                                                    |
| `packages/app/assets/images/icon.png`, `splash-icon.png`, `android-icon-foreground.png`                                                                                                                | The work window's icon, the Groupon G in curly braces `{ G }`, rendered from `packages/desktop/assets/brand/icon.svg`                                                                                                                                                                                                 |
| `packages/app/assets/images/notification-icon.png`                                                                                                                                                     | Groupon Desk's icon, rendered from the Desk's `AppIcon.png`                                                                                                                                                                                                                                                           |
| `packages/app/assets/images/favicon*.png` (the six status variants and `favicon.png`)                                                                                                                  | The `{ G }` on the green tile: `favicon-*.svg` (each marked in its first line) crop `packages/desktop/assets/brand/icon.svg` to its tile (viewBox `100 100 824 824`, no shadow), the status variants add Paseo's dot at the same place; rendered to 48 by 48 with `sharp`, `favicon.png` a copy of `favicon-dark.png` |
| `packages/app/public/apple-touch-icon.png`, `pwa-icon-192.png`, `pwa-icon-512.png`                                                                                                                     | The `{ G }` icon for the web app                                                                                                                                                                                                                                                                                      |
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
"Archived by a release train" (`groupon/train-archived-section.tsx`): every archive record keeps
the merged pull request's address, and the daemon answers which of them had a trunk as head
(`groupon-desk.train-archived-workspaces`, a built-in RPC under the plugin id `groupon-desk`,
answered by `session.ts` itself, `packages/server/src/groupon/train-archived.ts`). Restore is
Paseo's own workspace recovery: it unarchives the record and recreates a removed worktree from its
branch; a branch that is gone too cannot be restored, and Restore says so.

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

Who wrote what (the owner's word of 2026-10-21). A user message carries an optional author,
`{ userId, name, device? }` (`UserMessageAuthor` in `packages/protocol/src/agent-types.ts`, on
`send_agent_message_request` and on the timeline's `user_message`; a peer without it ignores it).
The window sends the signed-in person (`groupon/message-author-source.ts`, registered by the gate);
the hand sends the colleague the hub's command names for a shared prompt. The daemon keeps it on
the user_message it records (`AgentManager.notePromptAuthor`), in memory only: a daemon restart
rebuilds the timeline from the provider's history, and those messages come back with no author.
The chat draws three looks (`groupon/message-author-model.ts`, `message-author.tsx`): your own
prompts in Paseo's bubble, a colleague's on the left in the accent's tint with a name chip
("Carl Colleague · Mac app"), the agent's answers as before; a message with no author is the
workspace owner's. The History reader takes the author from the hub's `senderUserId` and the device
the colleague's window seals into the prompt; the Share screen carries the legend.

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
request by the repository's own convention, never merged. The workspace then shows as any other.
