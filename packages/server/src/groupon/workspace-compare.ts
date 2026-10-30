// Added for Groupon Desk (fork of Paseo, Apache-2.0): the Changes comparison an agent asks for the workspace its chat moves into, held for the window.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** The Groupon Desk plugin RPC the window reads: answered `{ requests: { [workspaceId]: CompareRequest } }`. */
export const WORKSPACE_COMPARE_RPC = "groupon-desk.workspaces.compare";

/** The window's `WorkingDiffComparison` values. */
const COMPARISONS = [
  "session",
  "session-committed",
  "session-uncommitted",
  "uncommitted",
  "base",
  "all",
] as const;
export type RequestedComparison = (typeof COMPARISONS)[number];

export interface CompareRequest {
  comparison: RequestedComparison;
  /** The ref the base comparison diffs against (a pull request's base, `origin/main`); null for the checkout's own base. */
  baseRef: string | null;
  requestedAt: string;
}

/** The ledger keeps the newest requests; a window asks only about the workspaces it shows. */
const KEPT = 200;

// A ref goes to git as an argument: a branch name's characters only, never an option.
const REF = /^(?!-)(?!.*\.\.)[\w./-]{1,200}$/;

/** A request from an RPC's input; null when none is asked; throws on one the window could not apply. */
export function compareRequestOf(input: unknown, now: Date): CompareRequest | null {
  if (input === undefined || input === null) return null;
  if (typeof input !== "object") throw new Error("compare must be an object");
  const { comparison, baseRef } = input as Record<string, unknown>;
  if (!COMPARISONS.includes(comparison as RequestedComparison)) {
    throw new Error(`compare.comparison is one of ${COMPARISONS.join(", ")}`);
  }
  if (
    baseRef !== undefined &&
    baseRef !== null &&
    (typeof baseRef !== "string" || !REF.test(baseRef))
  ) {
    throw new Error("compare.baseRef must be a branch or ref name");
  }
  return {
    comparison: comparison as RequestedComparison,
    baseRef: typeof baseRef === "string" ? baseRef : null,
    requestedAt: now.toISOString(),
  };
}

export function workspaceCompareLedger(paseoHome: string) {
  const path = join(paseoHome, "groupon", "workspace-compare.json");
  const read = async (): Promise<Record<string, CompareRequest>> => {
    try {
      const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
      return typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, CompareRequest>)
        : {};
    } catch {
      return {};
    }
  };
  return {
    all: read,
    async remember(workspaceId: string, request: CompareRequest): Promise<void> {
      const entries = Object.entries({ ...(await read()), [workspaceId]: request })
        .sort(([, a], [, b]) => b.requestedAt.localeCompare(a.requestedAt))
        .slice(0, KEPT);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(`${path}.tmp`, JSON.stringify(Object.fromEntries(entries)));
      await rename(`${path}.tmp`, path);
    },
  };
}
