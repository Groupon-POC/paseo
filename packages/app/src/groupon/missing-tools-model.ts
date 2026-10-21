// Added for Groupon Desk (fork of Paseo, Apache-2.0): which tools a Mac's hand cannot find, as the window says so.

/**
 * What the window says about the tools a Mac lacks: the hub hands each Mac's `missingTools` (the
 * hand checks `gh`, `git`, `claude` and `codex` in the PATH it gives its daemon, monorepo design
 * section 4b). Pure, so it is tested without React.
 *
 * Responsibilities:
 * - which of the reported tools are shown: `gh`, `git` and `claude` always; `codex` only while a
 *   session on that Mac uses Codex (it is optional: a Mac without it is fine until then)
 * - the small amber label per tool ("gh missing") and, on expanding the Mac, the sentence that
 *   says how to fix it
 *
 * Constraints:
 * - A tool name the window does not know is never shown: the hub takes whatever a hand sends
 */

import { GROUPON_MISSING_TOOLS, type MissingTool } from "./strings";

/** The tools in the order the labels read; `codex` is the optional one. */
export const MISSING_TOOL_ORDER: readonly MissingTool[] = ["gh", "git", "claude", "codex"];

/** The reported tools the person should see, in a fixed order; `usesCodex` lets `codex` through. */
export function shownMissingTools(
  reported: readonly string[] | null | undefined,
  usesCodex: boolean,
): MissingTool[] {
  if (!reported) return [];
  return MISSING_TOOL_ORDER.filter(
    (tool) => reported.includes(tool) && (tool !== "codex" || usesCodex),
  );
}

/** The amber label of one tool: "gh missing". */
export function missingToolLabel(tool: MissingTool): string {
  return GROUPON_MISSING_TOOLS.label(tool);
}

/**
 * The sentence per shown tool, for the expanded Mac: for one tool exactly "Install it on that Mac:
 * brew install gh, then gh auth login"; for several, each starts with its tool's name.
 */
export function missingToolFixes(tools: readonly MissingTool[]): string[] {
  if (tools.length === 0) return [];
  return tools.map((tool) =>
    tools.length === 1
      ? GROUPON_MISSING_TOOLS.fix[tool]
      : GROUPON_MISSING_TOOLS.fixOf(tool, GROUPON_MISSING_TOOLS.fix[tool]),
  );
}
