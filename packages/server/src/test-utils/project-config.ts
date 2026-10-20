// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests write a project's config where the daemon reads it, .groupon/desk.toml.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stringify } from "smol-toml";

/** The project config's path inside a repository, as git and the daemon name it. */
export const PROJECT_CONFIG_PATH = ".groupon/desk.toml";

/** The config as the repository file's text: an object in TOML, a string as it is (a broken file). */
export function projectConfigText(config: unknown): string {
  return typeof config === "string" ? config : stringify(config as Record<string, unknown>);
}

/** Writes `.groupon/desk.toml` under `dir` and returns its path. */
export function writeProjectConfig(dir: string, config: unknown): string {
  const path = join(dir, PROJECT_CONFIG_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, projectConfigText(config));
  return path;
}
