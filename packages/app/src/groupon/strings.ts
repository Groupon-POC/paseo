// Added for Groupon Desk (fork of Paseo, Apache-2.0): the English copy of the Groupon screens.
// Kept outside Paseo's i18n resources on purpose: those files churn upstream, and a key added only
// in English would fail their parity test. Every other language shows this English text.

export const GROUPON_ABOUT = {
  builtOn: "Built on Paseo (Apache-2.0) by Mohamed Boudra",
  builtOnHint: "Groupon Desk is a fork of Paseo. Paseo's licence and copyright notice are kept.",
} as const;

export const GROUPON_GATE = {
  title: "Groupon Desk",
  signInIntro:
    "Sign in with your Groupon account. Your Macs, their workspaces and your saved history come from the Core you choose.",
  badLocalUrl:
    "Type a Core address such as http://localhost:4100 (plain http only on this machine).",
  codeIntro: "Approve this code on Groupon's sign-in page:",
  openPage: "Open the sign-in page",
  signIn: "Sign in with Groupon",
  waiting: "Waiting for approval",
  denied: "The sign-in was denied.",
  expired: "The code expired before it was approved. Try again.",
  signedInAs: "Signed in as",
  vaultIntro:
    "Type your vault passphrase once. The key is made on this device and kept in its keychain; it opens what your Macs sealed on the hub. The passphrase never leaves this device.",
  passphrasePlaceholder: "Vault passphrase",
  openVault: "Open the vault",
  deriving: "Making the key (600,000 rounds)",
  signOut: "Sign out",
} as const;

export const GROUPON_SETTINGS = {
  section: "Groupon",
  account: "Groupon account",
  signedInAs: "Signed in as",
  core: "Core",
  vault: "Vault key",
  vaultKept: "Kept in this device's keychain; type the passphrase again only after signing out.",
  vaultKeptWeb:
    "Kept in this browser's local storage (development builds only); type the passphrase again only after signing out.",
  vaultMeasured: (ms: number, iterations: number, engine: string) =>
    `Made on this device in ${ms.toLocaleString("en-US")} ms (PBKDF2-SHA256, ${iterations.toLocaleString("en-US")} rounds, ${engine}); kept in its keychain.`,
  signOut: "Sign out of Groupon",
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
  unreadTeams: "GitHub did not answer for:",
  noRepository: "No repository here.",
  folderLabel: "Clone into",
  landsAt: "It lands at",
  download: "Clone and add",
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
    "This Mac overrides some of these values in this checkout's paseo.json; each is marked below.",
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
  gitTitle: "Git",
  targetBranch: "Target branch",
  envRequired: "Variables a script needs (names only)",
  overrideTitle: "Override on this Mac",
  overrideHint:
    "Optional. Paseo's own settings in this checkout's paseo.json: they apply on this Mac only, are marked as overrides above, and are never the repository's default. Do not commit them.",
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
    "This workspace is not on the hub, so it cannot be shared. Start it from Groupon Desk (a task with a chat) to share it.",
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
