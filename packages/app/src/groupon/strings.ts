// Added for Groupon Desk (fork of Paseo, Apache-2.0): the English copy of the Groupon screens.
// Kept outside Paseo's i18n resources on purpose: those files churn upstream, and a key added only
// in English would fail their parity test. Every other language shows this English text.

export const GROUPON_ABOUT = {
  builtOn: "Built on Paseo (Apache-2.0) by Mohamed Boudra",
  builtOnHint: "Groupon Desk is a fork of Paseo. Paseo's licence and copyright notice are kept.",
} as const;
