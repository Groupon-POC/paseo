// Changed for Groupon Desk (fork of Paseo, Apache-2.0): a project's config is the work window's sections of .groupon/desk.toml, never paseo.json.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import {
  PaseoConfigRawSchema,
  type PaseoConfigRaw,
  type PaseoConfigRevision,
  type ProjectConfigRpcError,
} from "@getpaseo/protocol/paseo-config-schema";
export {
  PaseoConfigRevisionSchema,
  ProjectConfigRpcErrorSchema,
  type PaseoConfigRevision,
  type ProjectConfigRpcError,
} from "@getpaseo/protocol/paseo-config-schema";

/**
 * Where a project keeps its config: the repository file Groupon Desk already reads
 * (`.groupon/desk.toml`), relative to the repository root. The work window owns three of its
 * sections, in Paseo's shape: `[worktree]` (setup, teardown, terminals, servicePorts),
 * `[scripts.<name>]` (command, type, port) and `[metadataGeneration.<kind>]`. Everything else in
 * the file (the desk's `[scripts]` keys and `[scripts.run.*]`, `[prompts]`, `[git]`, `[encore]`,
 * comments) belongs to Groupon Desk and survives every write untouched.
 */
export const PASEO_CONFIG_FILE_NAME = join(".groupon", "desk.toml");

/** The desk's own keys of `[scripts]` (`groupon desk repo` reads them); never a work window script. */
export const DESK_SCRIPT_KEYS: ReadonlySet<string> = new Set([
  "setup",
  "archive",
  "run_mode",
  "run",
]);

const OWNED_HEADER_PATTERN =
  /^\s*\[\[?\s*(worktree|scripts|metadataGeneration)(?:\s*\.\s*([A-Za-z0-9_-]+|"[^"]*"|'[^']*'))?[^\]]*\]\]?\s*(?:#.*)?$/;
const ANY_HEADER_PATTERN = /^\s*\[\[?\s*[A-Za-z0-9_."' -]+\]\]?\s*(?:#.*)?$/;

const OWNED_SECTIONS_COMMENT =
  "# The work window's own sections: what it runs when it prepares or archives a worktree and its Run menu (written by its Projects page).";

export type ReadPaseoConfigForEditResult =
  | { ok: true; config: PaseoConfigRaw | null; revision: PaseoConfigRevision | null }
  | { ok: false; error: ProjectConfigRpcError };

export type WritePaseoConfigForEditResult =
  | { ok: true; config: PaseoConfigRaw; revision: PaseoConfigRevision }
  | { ok: false; error: ProjectConfigRpcError };

export interface WritePaseoConfigForEditInput {
  repoRoot: string;
  config: PaseoConfigRaw;
  expectedRevision: PaseoConfigRevision | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolvePaseoConfigPath(repoRoot: string): string {
  return join(repoRoot, PASEO_CONFIG_FILE_NAME);
}

export function statPaseoConfigPath(repoRoot: string): PaseoConfigRevision | null {
  const configPath = resolvePaseoConfigPath(repoRoot);
  if (!existsSync(configPath)) {
    return null;
  }
  const stats = statSync(configPath);
  return {
    mtimeMs: stats.mtimeMs,
    size: stats.size,
  };
}

/**
 * The work window's config out of a repository file's text: its three sections in Paseo's
 * shape, the desk's own keys of `[scripts]` left out. Throws when the text is not TOML.
 */
export function paseoConfigFromDeskToml(text: string): Record<string, unknown> {
  const doc = parseToml(text) as Record<string, unknown>;
  const config: Record<string, unknown> = {};
  if (doc.worktree !== undefined) {
    config.worktree = doc.worktree;
  }
  if (isRecord(doc.scripts)) {
    const scripts = Object.fromEntries(
      Object.entries(doc.scripts).filter(([name]) => !DESK_SCRIPT_KEYS.has(name)),
    );
    if (Object.keys(scripts).length > 0) {
      config.scripts = scripts;
    }
  }
  if (doc.metadataGeneration !== undefined) {
    config.metadataGeneration = doc.metadataGeneration;
  }
  return config;
}

/** The project's config as plain data, or null when the repository has no `.groupon/desk.toml`. */
export function readPaseoConfigData(repoRoot: string): unknown {
  const configPath = resolvePaseoConfigPath(repoRoot);
  if (!existsSync(configPath)) {
    return null;
  }
  return paseoConfigFromDeskToml(readFileSync(configPath, "utf8"));
}

export function readPaseoConfigForEdit(repoRoot: string): ReadPaseoConfigForEditResult {
  try {
    const data = readPaseoConfigData(repoRoot);
    if (data === null) {
      return { ok: true, config: null, revision: null };
    }
    return {
      ok: true,
      config: PaseoConfigRawSchema.parse(data),
      revision: statPaseoConfigPath(repoRoot),
    };
  } catch {
    return {
      ok: false,
      error: { code: "invalid_project_config" },
    };
  }
}

/** The work window's sections as TOML: one table per script, so `[scripts]` itself is never redeclared. */
function ownedSectionsToml(config: PaseoConfigRaw): string {
  const parts: string[] = [];
  if (config.worktree !== undefined) {
    parts.push(stringifyToml({ worktree: config.worktree }));
  }
  for (const [name, entry] of Object.entries(config.scripts ?? {})) {
    parts.push(stringifyToml({ scripts: { [name]: entry } }));
  }
  if (config.metadataGeneration !== undefined) {
    parts.push(stringifyToml({ metadataGeneration: config.metadataGeneration }));
  }
  return parts.map((part) => part.trim()).join("\n\n");
}

function isOwnedHeader(line: string): boolean {
  const match = OWNED_HEADER_PATTERN.exec(line);
  if (!match) return false;
  if (match[1] !== "scripts") return true;
  const name = match[2]?.replace(/^["']|["']$/g, "");
  return name !== undefined && !DESK_SCRIPT_KEYS.has(name);
}

/**
 * The repository file's text with the work window's sections replaced: every table it owns is
 * cut (with the comment lines directly above it) and the new sections go where the first one
 * stood, else at the end. The rest of the file is kept byte for byte.
 */
export function replaceOwnedSections(existing: string, config: PaseoConfigRaw): string {
  const lines = existing.length > 0 ? existing.replace(/\n$/, "").split("\n") : [];
  const kept: string[] = [];
  let insertAt: number | null = null;
  let skipping = false;
  for (const line of lines) {
    if (ANY_HEADER_PATTERN.test(line)) {
      skipping = isOwnedHeader(line);
      if (skipping) {
        while (kept.length > 0 && /^\s*#/.test(kept[kept.length - 1] ?? "")) kept.pop();
        insertAt ??= kept.length;
        continue;
      }
    }
    if (!skipping) kept.push(line);
  }
  const sections = ownedSectionsToml(config);
  if (sections.length === 0) {
    return `${kept.join("\n").replace(/\n+$/, "")}\n`;
  }
  const block = [OWNED_SECTIONS_COMMENT, ...sections.split("\n")];
  const at = insertAt ?? kept.length;
  const before = kept.slice(0, at);
  while (before.length > 0 && before[before.length - 1]?.trim() === "") before.pop();
  const after = kept.slice(at);
  while (after.length > 0 && after[0]?.trim() === "") after.shift();
  const out = [
    ...before,
    ...(before.length > 0 ? [""] : []),
    ...block,
    ...(after.length > 0 ? ["", ...after] : []),
  ];
  return `${out.join("\n")}\n`;
}

export function writePaseoConfigForEdit(
  input: WritePaseoConfigForEditInput,
): WritePaseoConfigForEditResult {
  const parsedInput = PaseoConfigRawSchema.safeParse(input.config);
  if (!parsedInput.success) {
    return { ok: false, error: { code: "invalid_project_config" } };
  }
  const parsed = { data: ownedConfig(parsedInput.data) };
  if (Object.keys(parsed.data.scripts ?? {}).some((name) => DESK_SCRIPT_KEYS.has(name))) {
    return { ok: false, error: { code: "invalid_project_config" } };
  }

  const configPath = resolvePaseoConfigPath(input.repoRoot);
  const tempPath = join(dirname(configPath), `.desk.toml.${process.pid}.${randomUUID()}.tmp`);

  try {
    const existing = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
    const text = replaceOwnedSections(existing, parsed.data);
    // The file must still read back as exactly what was asked; anything else is refused unwritten.
    const roundTrip = PaseoConfigRawSchema.parse(paseoConfigFromDeskToml(text));
    if (JSON.stringify(comparable(roundTrip)) !== JSON.stringify(comparable(parsed.data))) {
      return { ok: false, error: { code: "write_failed" } };
    }
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(tempPath, text);
    const currentRevision = statPaseoConfigPath(input.repoRoot);
    if (!paseoConfigRevisionsEqual(currentRevision, input.expectedRevision)) {
      removeTempPaseoConfig(tempPath);
      return {
        ok: false,
        error: { code: "stale_project_config", currentRevision },
      };
    }

    renameSync(tempPath, configPath);
    const revision = statPaseoConfigPath(input.repoRoot);
    if (!revision) {
      return { ok: false, error: { code: "write_failed" } };
    }
    return { ok: true, config: parsed.data, revision };
  } catch {
    removeTempPaseoConfig(tempPath);
    return { ok: false, error: { code: "write_failed" } };
  }
}

/**
 * The part of a config the work window writes: its three sections. Any other top-level key
 * would land among Groupon Desk's own tables, so it is never written.
 */
function ownedConfig(config: PaseoConfigRaw): PaseoConfigRaw {
  const owned: PaseoConfigRaw = {};
  if (config.worktree !== undefined) owned.worktree = config.worktree;
  if (config.scripts !== undefined) owned.scripts = config.scripts;
  if (config.metadataGeneration !== undefined) owned.metadataGeneration = config.metadataGeneration;
  return owned;
}

/** A config as the file can hold it: keys in order, an empty script table the same as none. */
function comparable(config: PaseoConfigRaw): unknown {
  const { scripts, ...rest } = config;
  return sortKeys(scripts && Object.keys(scripts).length > 0 ? { ...rest, scripts } : rest);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys(value[key])]),
  );
}

function paseoConfigRevisionsEqual(
  left: PaseoConfigRevision | null,
  right: PaseoConfigRevision | null,
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.mtimeMs === right.mtimeMs && left.size === right.size;
}

function removeTempPaseoConfig(tempPath: string): void {
  try {
    rmSync(tempPath, { force: true });
  } catch {
    // Best-effort cleanup only; callers need the original write outcome.
  }
}
