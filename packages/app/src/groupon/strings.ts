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
