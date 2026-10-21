// Added for Groupon Desk (fork of Paseo, Apache-2.0): the English copy of the Groupon screens.
// Kept outside Paseo's i18n resources on purpose: those files churn upstream, and a key added only
// in English would fail their parity test. Every other language shows this English text.

export const GROUPON_ABOUT = {
  updatesWithDesk: "Updates arrive with Groupon Desk",
} as const;

export const GROUPON_GATE = {
  title: "Groupon Desk",
  signInIntro:
    "Sign in with your Groupon account to reach your Macs, their workspaces and your saved history.",
  /** Only a build that offers a choice of Core (`environmentChoiceOffered`) says so. */
  signInIntroChoice:
    "Sign in with your Groupon account. Your Macs, their workspaces and your saved history come from the Core you choose below.",
  badLocalUrl:
    "Type a Core address such as http://localhost:4100 (plain http only on this machine).",
  codeIntro: "Approve this code on Groupon's sign-in page:",
  openPage: "Open the sign-in page",
  /** Under the button, the sign-in page's host and path only (`device-sign-in-model.ts`). */
  typeCodeAt: (address: string) => `or type the code at ${address}`,
  copyCode: "Tap the code to copy it",
  codeCopied: "Code copied",
  signIn: "Sign in with Groupon",
  /** Under the button when this tab goes to the SSO gateway and back (`sso-redirect.ts`). */
  redirectLine: "Sign in opens Groupon's page and brings you back.",
  /** The device code, for when Groupon's page refuses this address. */
  codeInstead: "Sign in with a code instead",
  waiting: "Waiting for approval",
  denied: "The sign-in was denied.",
  expired: "The code expired before it was approved. Try again.",
  signedInAs: "Signed in as",
  vaultIntro:
    "Type your vault passphrase once. The key is made on this device and kept in its keychain; it opens what your Macs sealed on the hub. The passphrase never leaves this device.",
  vaultIntroWeb:
    "Type your vault passphrase once. The key is made in this browser and kept here, encrypted under a key that never leaves the browser and no script can read; it opens what your Macs sealed on the hub. The passphrase never leaves this device.",
  /** The vault step on a phone: one sentence, the rest behind "Why?". */
  vaultIntroShort: "Type your vault passphrase once; it never leaves this device.",
  why: "Why?",
  passphrasePlaceholder: "Vault passphrase",
  openVault: "Open the vault",
  deriving: "Making the key (600,000 rounds)",
  signOut: "Sign out",
} as const;

const VAULT_KEPT_WHERE = {
  electron: "kept in this window",
  web: "kept in this browser, encrypted",
  native: "kept in its keychain",
} as const;

export const GROUPON_SETTINGS = {
  section: "Groupon",
  account: "Groupon account",
  signedInAs: "Signed in as",
  core: "Core",
  vault: "Vault key",
  vaultKept: "Kept in this device's keychain; type the passphrase again only after signing out.",
  vaultKeptWeb:
    "Kept in this browser, encrypted under a key that never leaves the browser (IndexedDB, no script can read it); type the passphrase again only after signing out or clearing this site's data.",
  vaultKeptWindow: "Kept in this window, read from this Mac's keychain when the window opens.",
  vaultMeasured: (
    ms: number,
    iterations: number,
    engine: string,
    runtime: "electron" | "web" | "native",
  ) =>
    `Made on this device in ${ms.toLocaleString("en-US")} ms (PBKDF2-SHA256, ${iterations.toLocaleString("en-US")} rounds, ${engine}); ${VAULT_KEPT_WHERE[runtime]}.`,
  signOut: "Sign out of Groupon",
  signOutThisWindow:
    "Signs out this window only. Groupon Desk and the groupon command line on this Mac stay signed in, and the window signs in with them again the next time it opens.",
  fromThisMac: "Through Groupon Desk on this Mac, the sign-in the groupon command line shares",
} as const;

export const GROUPON_MACHINES = {
  direct: "This Mac: direct to its daemon, the relay as fallback, at",
  title: "Your Macs on the hub",
  refresh: "Refresh",
  refreshing: "Refreshing",
  empty: "No Mac of yours is on the hub yet. Run groupon desk serve on a Mac to add it.",
  added: "Added as a host, through Core's relay",
  noOffer: "Its hand has not offered a connection yet",
  sealedElsewhere: "Its offer does not open with this vault",
  failed: "Could not add it",
  relayConnected: "reachable through the relay",
  relayNotConnected: "on the relay, not connected",
  noRelay: "not on the relay",
  relayAt: (endpoint: string) => `at ${endpoint}`,
  lastSeen: (when: string) => `last seen ${when}`,
} as const;

export const GROUPON_YOUR_MACS = {
  title: "Your Macs",
  noneConnected: "No Mac of yours is connected",
  loading: "Looking for your Macs",
  notInstalledTitle: "No Groupon Desk is connected yet",
  notInstalled:
    "You probably have no Groupon Desk installed and connected yet. Install it on your Mac, sign in with the same Groupon account, and the Mac appears here.",
  download: "Download Groupon Desk for Mac",
  noneServing:
    "Your Macs are signed in but none is serving: press Work window in Groupon Desk on one of them, or run groupon desk serve install there.",
  noHand:
    "Groupon Desk on this Mac is signed in but its work hand is not running: press Work window in Groupon Desk there.",
  noHandCommand: "Or run groupon desk serve install in a terminal on that Mac.",
  otherVault:
    "Groupon Desk on this Mac keeps a different vault: open the vault here with the passphrase that Mac uses.",
  failed: (message: string) => `Could not connect to it: ${message}`,
  connected: "Connected",
  connecting: "Connecting",
  notRunning: "Work hand not running",
  thisMac: "This Mac",
  primary: "Primary",
  lastSeen: (ago: string) => `seen ${ago}`,
  refresh: "Refresh",
  refreshing: "Refreshing",
  loadFailed: (message: string) => `Could not read your Macs from the hub: ${message}`,
  autoRefresh: "Checked again every 15 seconds.",
  updated: (time: string) => `updated ${time}`,
  settings: "Settings",
} as const;

export const GROUPON_HELP = {
  reportProblem: "Report a problem",
} as const;

export const GROUPON_MAC_PICKER = {
  title: "Run on",
  label: "Mac",
  tooltip: "The Mac this workspace and its agent run on",
  on: (mac: string) => `On ${mac}`,
  thisMac: "This Mac",
  connecting: "connecting",
  noHand: "hand not running",
  otherVault: "different vault",
  failed: "could not connect",
  storedHost: "stored host",
  unknownMac: "a Mac",
} as const;

/** Every chooser of the Mac a project is added to: Add project, From GitHub, their host step. */
export const GROUPON_ADD_TO_MAC = {
  title: "Add project on which Mac?",
  githubTitle: "Clone on which Mac?",
  searchPlaceholder: "Search your Macs...",
  thisMac: "This Mac",
  thisMacWith: (note: string) => `This Mac · ${note}`,
  noHandHere:
    "The hand on this Mac is not running. Press Work window in Groupon Desk, or run groupon desk serve install.",
  noHandCommand: "groupon desk serve install",
  noHandCommandLabel: "The command that starts the hand on this Mac",
  githubHint:
    "A repository clones on the Mac you choose; a Mac that already has it shows the path.",
  noMac: "No Mac of yours is on the hub yet",
  hasItAt: (mac: string, path: string) => `${mac} already has it at ${path}`,
} as const;

/** New workspace's Repository field: a project is a repository, the same one on every Mac. */
export const GROUPON_REPOSITORY_PICKER = {
  label: "Repository",
  title: "Repository",
  tooltip: "The repository to work in, the same on every Mac that has it",
  searchPlaceholder: "Search repositories",
  choose: "Choose a repository",
  empty: "No repository on your Macs yet: add one with Add project, or clone one From GitHub.",
  noMatch: "No repository matches.",
  onNoMac: "on none of your Macs",
  thisMac: "This Mac",
  holds: (path: string) => `has it at ${path}`,
  missing: "not on this Mac",
  missingCloneable: "not here yet: choose it to clone it",
  notOn: (repository: string, mac: string) => `${repository} is not on ${mac} yet.`,
  folderNotOn: (folder: string, mac: string) =>
    `${folder} is a folder on another Mac. Choose a repository on ${mac}.`,
  cloneOn: (mac: string) => `Clone it on ${mac}`,
  adding: (path: string, mac: string) => `Opening ${path} on ${mac}`,
  refused: "the Mac refused it",
  addFailed: (path: string, mac: string, reason: string) =>
    `${path} on ${mac} did not open as a project: ${reason}`,
} as const;

export const GROUPON_ENVIRONMENT_BADGE = {
  hint: (label: string) =>
    label === "LOCAL"
      ? "This window is signed in to a local Core."
      : "This window is signed in to staging's Core.",
  openProd: "Open PROD",
  openProdLabel: "Open this page on production, in a new tab",
} as const;

export const GROUPON_TRAIN_ARCHIVED = {
  title: "Archived by a release train",
  intro:
    "Before 2026-10-20 a workspace could be matched to the release train's pull request (head staging) and was archived when the train merged. Listed here per Mac: every archived workspace on a shared trunk (staging, production, main, the default branch), and every one whose pull request's head was a trunk. Restore brings one back; a removed worktree on a trunk is recreated from the trunk's current head, any other from its branch.",
  restore: "Restore",
  reading: "Reading the archived workspaces",
  none: "None archived by a release train.",
  notConnected: "This Mac is not connected.",
} as const;

export const GROUPON_HISTORY = {
  title: "History",
  intro:
    "Saved on the hub, so it reads while your Macs sleep. Every message was sealed on the Mac and is opened here with your vault key.",
  open: "Open history",
  openHint: "Every workspace and chat on the hub, readable while your Macs sleep",
  loading: "Opening your history",
  empty: "Nothing on the hub yet. Chats your Macs run through Groupon Desk appear here.",
  noChats: "No chat in this workspace yet",
  retry: "Try again",
  sealedElsewhere: "This message does not open with your vault key.",
  thinking: "Thinking",
  result: "Result",
  resultError: "Result (failed)",
  asked: (tool: string) => `Asked to run ${tool}`,
  allowed: "Allowed",
  allowedAlways: "Allowed for this chat",
  denied: "Denied",
  withdrawn: "Withdrawn",
  notAllowed: (what: string) => `Not allowed: ${what}`,
  messages: (count: number) => `${count} ${count === 1 ? "message" : "messages"}`,
  waitingForMac: "Waiting for a Mac",
  waitingForMacHint:
    "History loads by itself as soon as one of your Macs connects. A Mac connects while Groupon Desk runs on it.",
} as const;

export const GROUPON_GITHUB = {
  title: "From GitHub",
  description:
    "Your organisations, teams and repositories on GitHub and on Groupon's GitHub Enterprise, cloned with gh",
  downloadsTo: "Clones to",
  hostSwitch: "GitHub host",
  searchPlaceholder: "Filter by name",
  reading: "Reading your GitHub access on this Mac",
  readingRepositories: "Reading the organisation's repositories",
  notSignedIn: "gh on this Mac is not signed in to",
  runThis: "Run this in a terminal on the Mac, then read again:",
  signInLabel: "The command that signs gh in",
  noLogin:
    "The platform found no GitHub account for your email. Ask for access below, then refresh.",
  noOrganisation: "You are in no GitHub organisation the platform knows.",
  noOrganisationHere: "You are in no organisation here. Type a name to find one.",
  notMember: "You are not in it yet",
  findOther: "Type a name to find any other organisation on",
  otherOrganisation: "Not yours · the repositories you can see there",
  askForAccess: "Ask for access",
  refresh: "Read again",
  allTeams: "All your teams",
  allTeamsHint: "Every repository your teams here reach, once each",
  noTeam: "You are on no team here.",
  teamUnread: "GitHub did not answer for this team's repositories",
  ssoTeam: "Single sign-on blocks this team's repositories",
  ssoBlocked: (command: string) =>
    `Single sign-on blocks this organisation: run ${command} and authorise it`,
  ssoCommandLabel: "The command that asks for single sign-on on this Mac",
  unreadTeams: "GitHub did not answer for:",
  noRepository: "No repository here.",
  folderLabel: "Clone into",
  landsAt: "It lands at",
  download: "Clone and add",
} as const;

/** The eye at the right edge of a passphrase field (`secret-input.tsx`). */
export const GROUPON_SECRET_INPUT = {
  show: "Show passphrase",
  hide: "Hide passphrase",
} as const;

export const GROUPON_COPY = {
  copy: "Copy",
  copied: "Copied",
} as const;

export const GROUPON_PHONE = {
  title: "Your phone",
  tileDescription: "Groupon Desk on your phone, through Groupon's server",
  body: "On your phone, open the address below (or scan the code with its camera) and sign in with the same Google account you use here. This Mac then appears among the hosts on the phone: the connection goes through Groupon's server, so there is nothing to pair and no key to copy.",
  addressLabel: "Groupon Desk on the web",
  qrLabel: "QR code of Groupon Desk's web address",
  qrUnavailable: "The code could not be drawn; type the address instead.",
} as const;

export const GROUPON_INSTALL = {
  /** The Settings section that keeps the guide reachable once the card was dismissed. */
  section: "Home screen",
  iosTitle: "Add Groupon Desk to your home screen",
  iosIntro: "Open it like an app, full screen, from your home screen:",
  /** Step 1 carries the Share icon beside it. */
  iosSteps: ["Tap Share", "Tap Add to Home Screen", "Tap Add"],
  installTitle: "Install Groupon Desk",
  installIntro: "Put Groupon Desk on your home screen and open it like an app, full screen.",
  install: "Install",
  notNow: "Not now",
  keepsSignedIn: "Installed, it keeps you signed in.",
} as const;

export const GROUPON_TICKET = {
  button: "Start a ticket",
  title: "Start a ticket",
  on: "On",
  intro:
    "The Dark Factory, without a terminal: the branch name and the readiness check, then a worktree on that branch and the agent with the flow's order.",
  ticketLabel: "Ticket",
  ticketPlaceholder: "ENC-1234 or the ticket's Jira link",
  repositoryLabel: "Repository",
  noRepository: "No git project on this Mac yet: add one first (From GitHub downloads it).",
  agentLabel: "Agent",
  noAgent: "No agent is ready on this Mac.",
  modelLabel: "Model",
  noModel: "This agent offers no model.",
  effortLabel: "Effort",
  start: "Start",
  starting: "Starting",
  didNotFinish: "The start did not finish.",
  openComment: "Open the readiness comment",
} as const;

export const GROUPON_REPOSITORY = {
  openFile: "The file on GitHub",
  overridesPresent:
    "This Mac overrides some of these values in this checkout's .groupon/desk.toml; each is marked below.",
  overridden: "Overridden on this Mac:",
  lifecycleTitle: "Worktree lifecycle hooks",
  setup: "Setup",
  teardown: "Teardown",
  none: "None",
  notSet: "Not set in the file",
  scriptsTitle: "Scripts",
  noScripts: "The file names no run script.",
  defaultScript: "default",
  metadataTitle: "Metadata generation",
  branchNames: "Branch names",
  branchNamesStandard: "The company standard: groupon ticket name decides.",
  commitMessages: "Commit messages",
  pullRequests: "Pull requests",
  improveDefault:
    "Not set in the file: Improve this repository sends the window's default prompt ([prompts] improve_repository replaces it).",
  gitTitle: "Git",
  targetBranch: "Target branch",
  envRequired: "Variables a script needs (names only)",
  overrideTitle: "Override on this Mac",
  overrideHint:
    "Optional. The work window's own sections of .groupon/desk.toml in this checkout ([worktree], [scripts.<name>]): a change applies on this Mac only, is marked as an override above, and becomes the repository's default only through a pull request.",
} as const;

export const GROUPON_PREFERENCES = {
  section: "Projects",
  remindWorktreeScripts:
    "Remind me to set up worktree scripts for projects without a repository file",
  remindWorktreeScriptsHint:
    "Off by default. A repository's .groupon/desk.toml is everyone's setup; turn this on to see the reminder card for a project that has none.",
} as const;

export const GROUPON_ENCORE = {
  title: "Encore",
  caption:
    "The Encore apps this repository's .groupon/desk.toml names, with their latest rollouts.",
  refresh: "Refresh",
  noRollout: "no rollout reported yet",
  openRollout: "Open on Encore Cloud",
  member: "You are a member",
  invited: "Invited: accept the invitation Encore Cloud emailed you",
  notMember: "You are not a member",
  requestWaiting: "Your request for access waits for a decision",
  decidedBy: "by",
  unknown: "Encore Cloud could not say whether you are a member",
  notHandedOut: "The platform does not hand out access to this app",
  askForAccess: "Ask for access",
  askUnknownHint:
    "Nobody could say whether you are already a member: this files a request for developer access, and the app's stakeholder decides.",
  askHint: "Files a request for developer access; the app's stakeholder decides.",
  filed:
    "Request filed: the app's stakeholder decides, then Encore Cloud emails you an invitation.",
  trainTitle: "Release train",
  noTrain: "No release train is open.",
  trainInto: "Open pull requests into",
  checks: {
    passing: "checks passing",
    failing: "checks failing",
    pending: "checks running",
    none: "no checks",
  },
  fileProblems: "Left out of the repository file:",
  environmentNote: "Read on",
} as const;

/** Sharing a workspace with a colleague (monorepo design section 13). */
export const GROUPON_SHARE = {
  menu: "Share…",
  title: "Share",
  intro:
    "A colleague you share this workspace with reads its chats on their own device. With write, they may also send the agent a prompt and allow or deny what it asks. The agent keeps running on your Mac, under your subscription. Every message is sealed: the hub cannot read it.",
  notOnHub:
    "This workspace is not on the hub yet. Your Mac adds every workspace to the hub within half a minute, and this page updates by itself once it has.",
  emailLabel: "Colleague's email",
  emailPlaceholder: "name@groupon.com",
  badEmail: "Type a whole email address.",
  read: "Read",
  write: "Read and write",
  share: "Share",
  sharing: "Sharing",
  shared: (email: string, role: string) =>
    `Shared with ${email} (${role}). Your Mac hands over the key as soon as its Groupon Desk runs.`,
  whoHasAccess: "Who has access",
  nobody: "Nobody else yet.",
  keyWaiting: "key not handed over yet",
  revoke: "Revoke",
  revoked: (email: string) => `${email} no longer sees this workspace.`,
  sharedWith: (count: number) => `Shared with ${count} ${count === 1 ? "colleague" : "colleagues"}`,
  sharedWithMe: "Shared with me",
  sharedWithMeEmpty: "Nothing shared with you yet.",
  by: (name: string) => `by ${name}`,
  waitingForKey: "waiting for the owner's Mac",
  canWrite: "you may write",
  canRead: "read only",
  composerPlaceholder: "Write to the agent on the owner's Mac",
  send: "Send",
  sent: "Sent. It reaches the agent when the owner's Mac takes it.",
  allow: "Allow",
  deny: "Deny",
  answered: "Answer sent to the owner's Mac.",
  wrote: (name: string) => `${name} wrote`,
} as const;

export const GROUPON_PRESENCE = {
  shareChip: "Share",
  shareChipLabel: "Share this workspace with a colleague",
  rowLabel: (count: number) =>
    `${count} ${count === 1 ? "person" : "people"} in this session now. Open Share.`,
  you: "you",
  owner: "owner",
  canWrite: "may write",
  canRead: "reads",
  hand: (label: string, connected: boolean) =>
    `${label}, runs the agent${connected ? ", connected through Groupon" : ", not connected through Groupon right now"}`,
  section: "People in this session now",
  nobodyElse: "Only you right now.",
  person: (name: string, facts: string[]) => [name, ...facts].join(" · "),
} as const;

export const GROUPON_TASKS = {
  title: "My tasks",
  caption:
    "From Jira, read by the platform for you. Every change to the filters or columns is kept as your default.",
  assigneeMine: "Current user",
  assigneeAnyone: "Anyone",
  type: "Type",
  status: "Status",
  anyTime: "Any time",
  lastDays: "Last {n} days",
  moreFilters: "More filters (JQL)",
  moreFiltersPlaceholder: "labels = cli ORDER BY priority DESC",
  clearFilters: "Clear filters",
  columns: "Columns",
  columnsTitle: "Columns",
  columnsSearch: "Search Jira's fields",
  columnsSearchClear: "Clear the search",
  restoreDefaults: "Restore defaults",
  take: "Take to development",
  previous: "Previous",
  next: "Next",
  loading: "Reading your tasks from Jira",
  noTasks: "No task matches these filters.",
  signedOut: "Sign in to see your Jira tasks: run groupon login on this Mac.",
  notSaved: "Your default could not be saved:",
  fieldsLoading: "Reading Jira's fields",
} as const;

/** The home page's Your access: the Encore apps and the GitHub organisations the person is in. */
export const GROUPON_ACCESS = {
  title: "Your access",
  readOn: "Read on",
  refresh: "Read again",
  notConnected: "No Mac is connected: Your access is read by the Groupon plugin on one of them.",
  encoreTitle: "Encore apps",
  encoreCaption: "Every Encore app the platform hands out, and where you stand on each.",
  encoreEmpty: "The platform hands out no Encore app.",
  encoreCount: (member: number, total: number) =>
    `You are a member of ${member} of ${total} ${total === 1 ? "app" : "apps"}.`,
  githubTitle: "GitHub",
  githubCaption: "The organisations and teams you are in, on github.com and on GitHub Enterprise.",
  notSignedIn: "Not signed in",
  signInHint: "gh on this Mac is not signed in here. Run this in a terminal, then read again:",
  signInLabel: "The command that signs gh in",
  signedInAs: "Signed in as",
  noOrganisation: "You are in no organisation here.",
  notMember: "not in it yet",
  membershipUnknown: "GitHub would not say",
  noTeam: "no team",
  otherOrganisations: (count: number) =>
    `${count.toLocaleString("en-US")} other ${count === 1 ? "organisation" : "organisations"} here, whose visible repositories you can clone (From GitHub).`,
  askWhere: "Where to ask for access:",
  askWhereLink: "the admin's GitHub onboarding page",
  enterprise: "GitHub Enterprise",
} as const;

/** The Standards page and its home tile: the engineering standards of the repository you work in. */
export const GROUPON_STANDARDS = {
  title: "Standards",
  tileDescription:
    "How to name a branch, title a pull request and run the flow, from the repository",
  intro:
    "The engineering standards of the repository you work in, read from the repository itself: how to name a branch, how to title and open a pull request, the flow.",
  project: "Repository",
  noProject: "Add a project first: the standards are read from a repository on one of your Macs.",
  readFrom: "Read from",
  pulledVersion: "pulled, version",
  sourceNote: "this repository's own files, where the standards are written",
  none: "This repository carries no engineering standards yet.",
  noneHint:
    "Pull the standards to read them here (groupon standards pull writes them into .standards/), or bring them in for good with groupon standards adopt, which prints the prompt to give your agent.",
  adoptLabel: "The command that brings the standards in",
  pull: "Pull the standards",
  pullAgain: "Pull again",
  pulling: "Pulling the standards",
  refresh: "Read again",
  documents: "Documents",
  allDocuments: (count: number) => `All ${count} documents`,
  fewerDocuments: "Only the open one",
  reading: "Reading the standards",
  since: "since",
  sectionTitle: "Engineering standards",
} as const;

/**
 * Improve this repository: one built-in prompt that tunes a repository so a newcomer, a person or
 * an agent, finds their way in it. A repository may replace it with its own text in
 * `.groupon/desk.toml`, `[prompts] improve_repository`.
 */
export const GROUPON_IMPROVE = {
  title: "Improve this repository",
  tileDescription: "Tune a repository so a newcomer and an agent are at home in it in five minutes",
  menuItem: "Improve this repository",
  intro:
    "An agent reads the repository, brings in the standards, sets up .groupon/desk.toml and a short Start here, then opens one pull request. It never merges.",
  repositoryLabel: "Repository",
  macLabel: "Mac",
  previewLabel: "What the agent will do",
  noRepository:
    "No repository on your Macs yet: add one with Add project, or clone one From GitHub.",
  chooseRepository: "Choose the repository to improve.",
  notOnAnyMac: (repository: string) =>
    `${repository} is on none of your Macs: clone it From GitHub first.`,
  noMacServing: (repository: string, macs: string) =>
    `No Mac that holds ${repository} is serving (${macs}): press Work window in Groupon Desk there, or run groupon desk serve install.`,
  noAgent: "No agent is ready on this Mac: set one up under Setup providers.",
  readingPrompt: "Reading the repository's own prompt",
  promptFromRepository:
    "The repository's own prompt, from .groupon/desk.toml ([prompts] improve_repository):",
  promptDefault: "The window's default prompt (the repository sets none in .groupon/desk.toml):",
  noAnswer: "the Groupon plugin on that Mac did not answer",
  promptUnread: (problem: string) =>
    `The repository's file could not be read (${problem}); the window's default prompt is used.`,
  where: (worktree: string, mac: string) =>
    `A new worktree, ${worktree}, on ${mac}, cut from the repository's default branch.`,
  agent: (agent: string, model: string) => `The agent: ${agent}, ${model}.`,
  showFullPrompt: "Show the whole prompt",
  hideFullPrompt: "Hide the whole prompt",
  start: "Start",
  starting: "Creating the worktree and starting the agent",
  createFailed: "The workspace was not created.",
  workspaceTitle: "Improve this repository",
  /** The default's steps, one line each, shown as the preview. */
  steps: [
    "Read the README, AGENTS.md or CLAUDE.md, the scripts and .groupon/desk.toml",
    "Bring in the engineering standards: groupon standards adopt, then groupon standards pull",
    "Add or fix .groupon/desk.toml: setup, run scripts, prompts, target branch, Encore apps",
    "One command to set up, one to run, one to validate, and a short Start here",
    "A short header on every source file that has none",
    "One pull request by the repository's own convention, with what it could not decide; never merged",
  ],
  defaultPrompt: [
    "Improve this repository so that a newcomer, a person or an agent, can work in it within their first five minutes. Work only in this worktree. Never merge anything and never push to the target branch.",
    "",
    "1. Read before you change anything: the README, AGENTS.md or CLAUDE.md, the package manifests and their scripts (package.json, Makefile, scripts/), the CI workflows, and .groupon/desk.toml if it exists. Note what a newcomer has to know and what is missing or wrong.",
    "2. Bring in the engineering standards. Run `groupon standards adopt` in this folder: off a terminal it prints the adoption prompt (`--out <file>` writes it to a file instead). Follow that prompt as written; the standards are copied whole and never edited in the copy. Then run `groupon standards pull` so the copy is current.",
    "3. Add or fix .groupon/desk.toml: [scripts] setup (what a fresh worktree needs: install, generated files), the run scripts as [scripts.run.<id>], [prompts] (create_pr, fix_errors, code_review, commit_messages, and improve_repository if this repository wants its own version of this prompt), [git] target_branch, and an [encore.apps.<id>] table for each Encore app the repository deploys. Name only commands that exist here. Never put a secret in the file, only the names of the variables a script needs.",
    '4. Make the first five minutes easy: one command to set up, one to run, one to validate, each named in the README and in AGENTS.md; a short "Start here" at the top of the README; AGENTS.md as the one entry point for agents, with CLAUDE.md only pointing at it.',
    "5. Write a short header at the top of every source file that has none: one line on what the file is for, then what it owns and what must not be broken, only where there is something to say.",
    "6. Run the validate command you named until it passes.",
    "7. Open one pull request following this repository's own convention (its branch name, title and template). Say what changed and list what you could not decide and why. Never merge it.",
    "",
    "A step that does not fit this repository is skipped and named in the pull request, never forced.",
  ].join("\n"),
} as const;

export const GROUPON_AUTHOR = {
  /** A message whose writer the window cannot name. */
  someone: "Someone",
  /** A colleague's message whose writer's name the window does not have. */
  colleague: "A colleague",
  /** A message from another agent whose workspace title the window does not have. */
  anotherAgent: "Another agent",
  chip: (name: string, device: string | null) => (device ? `${name} · ${device}` : name),
  chipLabel: (chip: string) => `Written by ${chip}`,
  agentChipLabel: (chip: string) => `Sent by another agent: ${chip}`,
  legendTitle: "In the chat",
  you: "you",
  colleagueLegend: "colleague",
  anotherAgentLegend: "another agent",
  agent: "this agent",
} as const;

/**
 * The sidebar's Connected computers, above the subscriptions' limits (owner, 2026-10-21): each
 * of the person's Macs, a green dot while its hand reports, and on expanding one its CPU and RAM.
 */
export const GROUPON_COMPUTERS = {
  heading: "Connected computers",
  /** The green label after this computer's name; WW-85's `GROUPON_THIS_COMPUTER` says the same. */
  thisComputer: "This computer",
  online: "online",
  offline: "offline",
  cpu: "CPU",
  memory: "RAM",
  percent: (value: number) => `${value}%`,
  seen: (ago: string) => `Offline, last seen ${ago}`,
  /** Online through the window's connection, but no fresh reading: just started, or a hand older than the readings. */
  noLoad: "Online; no CPU and RAM reading yet (an older hand sends none: groupon update).",
  expand: (name: string) => `Show CPU and RAM of ${name}`,
  collapse: (name: string) => `Hide CPU and RAM of ${name}`,
} as const;
