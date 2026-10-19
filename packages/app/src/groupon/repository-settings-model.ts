// Added for Groupon Desk (fork of Paseo, Apache-2.0): the repository's committed standard against this Mac's override.

/**
 * A Groupon repository says how a worktree is prepared and run in `.groupon/desk.toml` on its
 * default branch (Paseo's `paseo.json` beside it is the shim that calls `groupon desk repo ...`).
 * That file is the default for everyone: the Projects page shows it read-only, nobody is nudged to
 * set worktree scripts up, and what a person changes in Paseo's own `paseo.json` in their checkout
 * is an override on that Mac only, marked as one. Pure, so the rules are tested without a screen.
 */

import type { PaseoConfigRaw } from "@getpaseo/protocol/messages";
import type { ProjectSettingsAnswer } from "./desk-plugin-rpc";

/** The shim's own commands (monorepo `paseo.json`): routing to the desk file, never an override. */
export const SHIM_SETUP = "groupon desk repo setup";
export const SHIM_TEARDOWN = "groupon desk repo archive";
export const shimRunCommand = (id: string): string => `groupon desk repo run ${id}`;

/** The repository decides: its default branch carries the desk file or Paseo's own file. */
export function hasRepositoryStandard(answer: ProjectSettingsAnswer | null | undefined): boolean {
  return Boolean(answer && (answer.settings !== null || answer.hasPaseoJson));
}

/** A lifecycle command as Paseo keeps it (a string, or a list run in order), as one line. */
export function commandText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    const parts = value.filter(
      (part): part is string => typeof part === "string" && part.trim() !== "",
    );
    return parts.length > 0 ? parts.join(" && ") : null;
  }
  return null;
}

export interface LocalOverrides {
  setup: string | null;
  teardown: string | null;
  scripts: { id: string; command: string }[];
  commitMessages: string | null;
  pullRequests: string | null;
  branchNames: string | null;
}

const EMPTY: LocalOverrides = {
  setup: null,
  teardown: null,
  scripts: [],
  commitMessages: null,
  pullRequests: null,
  branchNames: null,
};

const instructionsOf = (entry: unknown): string | null => {
  if (typeof entry !== "object" || entry === null) return null;
  const instructions = (entry as { instructions?: unknown }).instructions;
  return typeof instructions === "string" && instructions.trim() ? instructions : null;
};

/** What this checkout's `paseo.json` sets beyond the shim: each is an override on this Mac. */
export function overridesOf(config: PaseoConfigRaw | null | undefined): LocalOverrides {
  if (!config) return EMPTY;
  const setup = commandText(config.worktree?.setup);
  const teardown = commandText(config.worktree?.teardown);
  const scripts = Object.entries(config.scripts ?? {}).flatMap(([id, entry]) => {
    const command = commandText((entry as { command?: unknown }).command);
    return command && command !== shimRunCommand(id) ? [{ id, command }] : [];
  });
  const metadata = config.metadataGeneration;
  return {
    setup: setup && setup !== SHIM_SETUP ? setup : null,
    teardown: teardown && teardown !== SHIM_TEARDOWN ? teardown : null,
    scripts,
    commitMessages: instructionsOf(metadata?.commitMessage),
    pullRequests: instructionsOf(metadata?.pullRequest),
    branchNames: instructionsOf(metadata?.branchName),
  };
}

export function hasOverrides(overrides: LocalOverrides): boolean {
  return (
    overrides.setup !== null ||
    overrides.teardown !== null ||
    overrides.scripts.length > 0 ||
    overrides.commitMessages !== null ||
    overrides.pullRequests !== null ||
    overrides.branchNames !== null
  );
}

/** The line above the values: where they come from and how they change. */
export function standardCaption(answer: ProjectSettingsAnswer): string {
  const branch = answer.branch ?? "the default branch";
  if (answer.source === "checkout") {
    return `From .groupon/desk.toml in this checkout: it is not on ${branch} yet, so it is nobody else's default until a pull request lands it.`;
  }
  return `From .groupon/desk.toml on ${branch}; change it with a pull request.`;
}
