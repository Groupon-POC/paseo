<!-- Added for Groupon Desk (fork of Paseo, Apache-2.0). -->

# Groupon Desk, a fork of Paseo

This file is the fork's map: what Groupon Desk changed in Paseo, where, and the rules for changing
more. The design it serves is the monorepo's `_documentation/design/groupon-desk-work-window-design.md`
(`groupon2/engineering-development`), sections 6 (the window), 12a (Paseo as the base), 12b (the
phone's path), 13 (sharing) and 16 (the release path). Every path below is in this repository
unless it names the monorepo; `groupon/`, `components/`, `screens/`, `hooks/` and `app/` are under
`packages/app/src/`.

## Contents

1. What this fork is
2. The one window: scheme, sign-in, vault, brand
3. Screens we added
4. The plugin RPCs it calls
5. Build and release: the pins, the bundle
6. Rules for changing upstream files
7. Open items

## 1. What this fork is

This branch (`groupon`) is Groupon Desk's fork of [Paseo](https://github.com/getpaseo/paseo) by
Mohamed Boudra, licensed under Apache-2.0. `LICENSE` and its copyright line are unchanged. The fork
starts at Paseo's tag `v0.12.0` and is rebased onto Paseo's tags (the monorepo's
`.agents/skills/meta-paseo-upgrade/SKILL.md`, "Step 3: the fork, rebased onto the tag").

It is the work window of Groupon Desk, built three ways from one commit: the Electron app that
Groupon Desk nests on Apple silicon Macs, the web build the monorepo serves at
`desk.livingsocial.com` for a phone or an Intel Mac, and (later) a native iPhone build. The
server packages of the same commit run on every Mac inside Groupon Desk's hand (`groupon desk
serve`), which owns the daemon, registers it on Core's relay and loads the Groupon plugin beside
Paseo's built-ins. Core is the hub: the person's Macs, the registry, the sealed transcripts and the
relay. Paseo's own relay, pairing and hosted pages are not used.

## 2. The one window: scheme, sign-in, vault, brand

### 2.1 The scheme: `groupon-desk`

The packaged window serves its pages from its own scheme, `groupon-desk` (Paseo's is `paseo`), so
every call it makes carries the origin `groupon-desk://app`: Core's CORS allowlists name it, the
daemon allows it (`packages/server/src/server/bootstrap.ts`), and the hand's relay door admits
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

### 2.2 Signing in: production, and this Mac's sign-in

A release build (the packaged window and the web build) signs in to production's Core and offers
no choice; an older build's stored choice is overridden. A development bundle offers Production,
Staging and Local and starts on Local, and a bundle exported with
`EXPO_PUBLIC_GROUPON_ENVIRONMENTS=all` keeps the choice (`groupon/environments.ts`,
`defaultEnvironmentId` and `environmentChoiceOffered`; `groupon/gate.tsx`). The gate stands in
front of Paseo's app: Core's device sign-in (a code approved on Groupon's SSO page, the flow the
CLI's `groupon login` uses; `groupon/core-client.ts`), then the vault passphrase, typed once and
turned into the vault key on the device (`groupon/crypto.ts`, `groupon/session.ts`).

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

### 2.3 Storage on the web

A browser has no keychain, so the web build keeps the session and the vault key sealed with
AES-GCM under a non-extractable WebCrypto device key held in IndexedDB (`groupon-desk-keys`); only
ciphertext sits in `localStorage` (prefix `gdw1.`), and without IndexedDB nothing outlives the page
(`groupon/secure-storage.web.ts`). Native builds use the keychain or keystore
(`groupon/secure-storage.ts`).

### 2.4 The hand owns the daemon

The daemon on a Mac starts only by Groupon Desk's hand (`groupon desk serve`, a launchd agent), which registers it on Core's relay; the
window never runs one of its own (owner, 2026-10-20; the monorepo's design
`groupon-desk-work-window-design.md`, sections 12a and 12b). `GROUPON_DESK_HAND_OWNS_DAEMON`
(`groupon/pairing-policy.ts`) keeps the app from starting Paseo's built-in daemon at launch or
on retry (`app/_layout.tsx`), from polling the desktop for one (`hooks/use-is-local-daemon.ts`),
and from offering Enable or Manage built-in daemon; the desktop's main process carries the same
switch (`packages/desktop/src/daemon/groupon-local-daemon.ts`): it refuses
`start_desktop_daemon` and `restart_desktop_daemon`, answers `desktop_daemon_status` as stopped
without launching Paseo's CLI, and looks for this Mac's daemon in the hand's home
(`~/.groupon/paseo`) alone, never in `~/.paseo`.

On a Mac the window reaches the hand's daemon directly (`groupon/local-daemon.ts`, from
`~/.groupon/paseo`); every other Mac, and every Mac from the web, through Core's relay
(`groupon/core-relay.ts`: Paseo's relay frames wrapped as JSON on Core's stream
`/user/groupon_desk/paseo_relay/stream`, the session token in the Encore handshake, a keepalive
every 20 s; the monorepo's design, section 12b).

### 2.5 No trace of Paseo a person meets

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

The other eight languages (`ar`, `es`, `fr`, `ja`, `ko`, `pt-BR`, `ru`, `zh-CN`) name Groupon Desk
wherever Paseo's name stood (2026-10-20); the rest of their text is Paseo's, and the Groupon
screens show English in every language.

### 2.6 A project's config: `.groupon/desk.toml`, never `paseo.json`

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

## 3. Screens we added

Paseo's code for the screens and ways we replaced stays, unreachable, so a rebase onto a new tag
stays small; only the way to it is gone (section 6). The plugin RPC each screen calls is in
section 4.

### 3.1 Your Macs, kept current

No host is added by hand in any build (owner, 2026-10-20: a person connects only to their own signed-in devices; there are no
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
end-to-end specs that drive them (`packages/app/e2e/`) do not apply to this fork.

### 3.2 New workspace: Repository

A project is a repository, the same one on every Mac (owner, 2026-10-20: "I am starting it inside a workspace,
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

### 3.3 New workspace: On <Mac>

Beside the repository dropdown, New workspace always shows which Mac the workspace and its agent start on, even with one Mac (owner,
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

### 3.4 My tasks, and Start a ticket

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

Start a ticket (`groupon/start-ticket-button.tsx`, `start-ticket-sheet.tsx`, `start-ticket-model.ts`,
mounted on the New workspace page) runs the ticket flow on the page's Mac: the CLI names the
branch and grades readiness, and a ticket handed back shows its questions instead of a workspace.

### 3.5 Your access and the Standards page

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

### 3.6 The Projects page and the Encore card

A project's settings page (`screens/project-settings-screen.tsx`) shows `.groupon/desk.toml` as the
repository's default branch carries it, read-only, with a link to the file
(`groupon/repository-settings.tsx`, `repository-settings-model.ts`), and the Encore card
(`groupon/encore-state-section.tsx`, `encore-state-model.ts`, read every minute): each Encore app
the file names with the person's standing, the latest rollout per environment, Ask for access, and
the open release train with its checks. The worktree reminder Paseo shows when a project has no
setup script is off by default (`groupon/worktree-nudge-setting.tsx`).

### 3.7 From GitHub

Add project offers one GitHub way, the fork's From GitHub
(`packages/app/src/groupon/github-project-sheet.tsx`): on github.com or on Groupon's GitHub
Enterprise (`github.groupondev.com`), switched at the top, the person's organisations, teams and
repositories (on the enterprise also any other organisation, found by name), opening on the host,
organisation and team picked last time, cloned with `gh` from that host into the Mac's checkout
folder and added as a normal project. A host `gh` is not signed in to shows the command that
signs it in. `components/add-project-flow.tsx`
filters Paseo's `github` method out of the menu.

### 3.8 Sharing, Shared with me, and History

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

History (`groupon/history-screen.tsx`, `history-chat-screen.tsx`, `history.ts`; routes
`app/hub-history/`) reads the person's workspaces and chats from the hub's overview and opens each
chat's sealed messages on the device with the vault's relay key; the hub keeps them while the Mac
sleeps, so nothing in it needs a Mac.

### 3.9 Your phone, and Settings > Groupon

A phone reaches a Mac through Core once signed in with the same Google account, so Settings shows Your phone (`groupon/phone-section.tsx`: the work window's
web address per environment, `GROUPON_DESK_WEB_URL`, and its QR code) where Paseo had Pair
device, and no screen shows, exports or takes a pairing offer: `PASEO_PAIRING_OFFERS`
(`groupon/pairing-policy.ts`) hides the QR scan and the pasted pairing link among the ways to add
a host and on the welcome screen, and the direct form no longer takes a relay link.

Settings > Groupon (`groupon/settings-section.tsx`) shows the account, the vault and the hub's Macs
with when they were last read; signing out there, in the desktop window, signs out the window only,
never the Mac.

### 3.10 Cron: Paseo's Schedules, unchanged

Groupon Desk's cron jobs are Paseo schedules in the hand's daemon (the monorepo's decision log 07a,
2026-10-19), so the Schedules screen is upstream's (`screens/schedules-screen.tsx`, `app/schedules.tsx`)
and the fork adds nothing to it; `groupon cron` on the Mac is a client of the same schedules.

## 4. The plugin RPCs it calls

The Groupon plugin is the monorepo's `packages/desk-paseo-plugin`, loaded by the hand into the
daemon; its README lists every RPC with what it runs on the Mac ("Every RPC and who reads it").
The app calls them by name through `groupon/desk-plugin-rpc.ts` (`GROUPON_RPC`), whose sample
answers both sides read (the plugin's `tests/rpc.test.ts`). A plugin RPC ends at 60 seconds, so a
longer task is a job the app follows (`followJob`, every 1.5 s).

| RPC                             | Called from                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `groupon.github-access`         | `groupon/github-project-sheet.tsx`, `groupon/home-access.tsx`                                             |
| `groupon.github-repositories`   | `groupon/github-project-sheet.tsx`                                                                        |
| `groupon.github-clone`          | `groupon/github-project-sheet.tsx`                                                                        |
| `groupon.ticket-start`          | `groupon/start-ticket-sheet.tsx`                                                                          |
| `groupon.job`                   | `groupon/desk-plugin-rpc.ts` (`readJob`)                                                                  |
| `groupon.project-settings`      | `groupon/repository-settings.tsx`                                                                         |
| `groupon.encore-state`          | `groupon/encore-state-section.tsx`                                                                        |
| `groupon.encore-request-access` | `groupon/encore-state-section.tsx`, `groupon/home-access.tsx`                                             |
| `groupon.encore-apps`           | `groupon/home-access.tsx`                                                                                 |
| `groupon.jira-search`           | `groupon/jira-tasks-card.tsx`                                                                             |
| `groupon.jira-fields`           | `groupon/jira-tasks-columns.tsx`                                                                          |
| `groupon.jira-saved-view`       | `groupon/jira-tasks-card.tsx`                                                                             |
| `groupon.standards`             | `groupon/standards-page.tsx`                                                                              |
| `groupon.ticket-flow`           | Not the app: the plugin's own Flow chip (`client/flow-chip.tsx` there)                                    |
| `groupon.desk-overview`         | Not the app: the plugin's own settings page (`client/settings.tsx` there); `GROUPON_RPC` does not list it |

An RPC added on one side is added on the other in the same change: the plugin's `shared/rpc.ts`
and its test, and `GROUPON_RPC` here.

## 5. Build and release: the pins, the bundle

### 5.1 The pins

Nothing builds from this branch's tip. The monorepo pins one commit twice, and both pins move in
one commit there: `scripts/desk-release/fork.json` (`commit`; the Mac app and the hand's server)
and `apps/frontend-desk-ts/fork.json` (`ref`; the web build), each the full 40-character hash. A
change here reaches a person only when the pins move and the monorepo's pipeline publishes. No
guard holds the two pins equal yet (section 7).

### 5.2 The desktop app inside Groupon Desk

Groupon Desk's release build (`scripts/desk-release/build.mjs` in `groupon2/engineering-development`,
pinned in `scripts/desk-release/fork.json` there, `commit`) builds `packages/desktop` from a pinned commit of
this branch with `npm run build:desktop -- --publish never --mac dir --<arch>` and nests the result
in the menu-bar app as `Groupon Desk.app/Contents/Helpers/Groupon Desk Work.app`; Desk's "Work
window" button opens it. The app id is `com.groupon.desk.work`. Signing and notarisation come from
the environment that build sets (`CSC_NAME`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`,
`APPLE_API_ISSUER`; on a local build ad-hoc with `-c.mac.identity=-` and without the hardened runtime, `-c.mac.hardenedRuntime=false`, since ad-hoc code under it cannot load Electron Framework). A child the app starts in node
mode (Paseo's CLI) runs as the bundle's Helper, which carries `LSUIElement`
(`packages/desktop/src/daemon/runtime-paths.ts`): the Helper is named after `productName`
("Groupon Desk Work Helper.app") while the executable keeps Paseo's name, and a child started from the
main executable instead checks in with LaunchServices as a Foreground app the moment it sets
`process.title` (Paseo's supervisor and daemon do), so each got its own bouncing Dock tile. The app never checks Paseo's
update feed (`packages/desktop/src/features/auto-updater.ts`): Groupon Desk's own update replaces
both.

### 5.3 The server bundle

From the same checkout, after `build:desktop` built the server's packages, the monorepo's
`scripts/desk-release/pack-server.mjs` packs the six workspace packages the server runs on
(`@getpaseo/server`, `client`, `highlight`, `plugin`, `protocol`, `relay`) with
`npm pack --ignore-scripts` into `paseo-server.tgz`, with an `index.json` naming the commit and each
tarball's sha256. Groupon Desk's signed `desk-manifest.json` names it (`paseoServer`), the shelf
serves it, and the hand installs it with npm at its next start. So every server-side change here
(the allowed origin in `packages/server/src/server/bootstrap.ts`, the project config in
`packages/server/src/utils/paseo-config-file.ts`, the server's texts) reaches every Mac with the
window, at the same pin. The server tarball must carry `packages/server/dist/server/server/exports.js` and the
built-in plugin loader (`packages/server/dist/server/server/plugins/builtin/index.js`, both made by `npm run build:server`), which the hand loads.

### 5.4 The web build

The monorepo's `apps/frontend-desk-ts` clones the pinned commit, runs `npm run build:app-deps` and
`expo export --platform web` in `packages/app`, and serves the result with its own shell (Sentry,
Marker.io, the incident banner) at `desk.livingsocial.com` and `desk.grpn.site`; its headers (a
CSP in Report-Only, the microphone open to the page) are set there
(`apps/frontend-desk-ts/HOW_TO_PROGRAM.md` in the monorepo).

## 6. Rules for changing upstream files

- **Mark every change.** Every changed source file carries a first-line comment "Changed for
  Groupon Desk (fork of Paseo, Apache-2.0): <what>", and every added file "Added for Groupon Desk".
  Files that cannot carry a comment are listed in the table below instead (Apache-2.0, section
  4(b)); a change to one of them adds or edits its row.
- **Add, do not rewrite.** Groupon code lives in `groupon/` (and `packages/desktop/src/features/`
  for the main process); an upstream file gets the smallest change that mounts it (one marked line
  where possible: the My tasks card is one line in `screens/new-workspace-screen.tsx`).
- **Switch off, do not delete.** A Paseo way we replace stays in the code and becomes unreachable
  through one named switch: `PASEO_PAIRING_OFFERS`, `PASEO_MANUAL_HOSTS` and
  `GROUPON_DESK_HAND_OWNS_DAEMON` (`groupon/pairing-policy.ts`), `PASEO_WEB_LINKS` and
  `PASEO_CLI_INSTALL` (`groupon/paseo-web-links.ts`). A rebase onto a new tag then meets few
  conflicts.
- **Names a person reads are ours; identifiers are Paseo's.** Section 2.5. The Groupon screens'
  English copy lives in `groupon/strings.ts`, outside the i18n files, so the other eight languages
  keep Paseo's text everywhere but the product name.
- **A Groupon fetch query declares a finite stale time.** Paseo's `useFetchQuery` throws on a
  missing or infinite `staleTimeMs` and takes the whole screen down; `groupon/fetch-queries.test.ts`
  reads every Groupon file for one.
- **The core goes upstream.** A change Paseo's core needs (not a Groupon screen) is also offered to
  upstream as a pull request (the monorepo's decision log 07a, 2026-10-19).
- **Upstream's tests that do not apply.** The end-to-end specs under `packages/app/e2e/` that drive
  the add-host modals, and the native mobile tests under `packages/app/e2e/mobile/` that open
  `paseo://` links in upstream's own iOS and Android app (`sh.paseo.debug`), which this fork does
  not build.

Files that cannot carry a comment:

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

## 7. Open items

- **The web build's CSP** is Report-Only (the monorepo's WW-37): the Mermaid diagram and HTML
  preview frames (`srcdoc` iframes) run inline script, and the changelog sheet fetches upstream's
  `CHANGELOG.md` from `raw.githubusercontent.com`; each is settled here before the policy is
  enforced.
- **Voice**: the web build may use the microphone, but the hand starts the daemon with dictation
  and voice off (WW-38).
- **The two pins** in the monorepo have no guard that holds them equal (section 5.1).
- **`packages/desktop/electron-builder.yml`** keeps `executableName: Paseo` (the bundle's
  executable and its Helper's executable keep Paseo's name, which Activity Monitor shows), and
  Paseo's `publish` and `artifactName` entries, unused by Groupon Desk's `--publish never --mac
dir` build.
- **The native iPhone build** is not built (WW-36): the phone uses the web build.
- **The Groupon screens are English** in every language.
- **The plugin's `hasPaseoJson`** answer (always false) is kept for windows built before this fork
  read its project config from `.groupon/desk.toml`; it leaves with the next pin (the plugin's
  `server/project-settings.ts` in the monorepo).
