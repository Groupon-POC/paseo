// Added for Groupon Desk (fork of Paseo, Apache-2.0): what the Standards page says and which document it opens, as pure functions.

/**
 * The Standards page (`standards-page.tsx`) reads the engineering standards of one repository on
 * one of the person's Macs through the Groupon plugin. These pick the repository (the one picked
 * last time, else the first), the document to open (the one picked, else the first: the
 * branch-name standard), and say where the standards were read from. Pure, so the page's choices
 * are tested without rendering it.
 */

import type { StandardsAnswer, StandardsDocument } from "./desk-plugin-rpc";
import { GROUPON_STANDARDS } from "./strings";

/** A repository the page can read: a project on one of the person's Macs. */
export interface StandardsProject {
  serverId: string;
  serverName: string;
  repoRoot: string;
  name: string;
}

export interface StandardsPlace {
  serverId: string;
  repoRoot: string;
}

/** The person's projects, one row per Mac and checkout, online Macs first, by name. */
export function standardsProjectsOf(
  projects: readonly {
    projectName: string;
    projectCustomName?: string | null;
    hosts: readonly {
      serverId: string;
      serverName: string;
      repoRoot: string;
      isOnline: boolean;
      projectCustomName: string | null;
    }[];
  }[],
): StandardsProject[] {
  const rows = projects.flatMap((project) =>
    project.hosts
      .filter((host) => host.repoRoot.trim().length > 0)
      .map((host) => ({
        serverId: host.serverId,
        serverName: host.serverName,
        repoRoot: host.repoRoot,
        name: host.projectCustomName || project.projectCustomName || project.projectName,
        isOnline: host.isOnline,
      })),
  );
  return rows
    .sort((a, b) => Number(b.isOnline) - Number(a.isOnline) || a.name.localeCompare(b.name))
    .map(({ isOnline: _isOnline, ...row }) => row);
}

/** The repository picked last time when it is still there, else the first one. */
export function chosenProject(
  projects: readonly StandardsProject[],
  remembered: StandardsPlace | null,
): StandardsProject | null {
  const kept = remembered
    ? projects.find(
        (project) =>
          project.serverId === remembered.serverId && project.repoRoot === remembered.repoRoot,
      )
    : undefined;
  return kept ?? projects[0] ?? null;
}

/** The document picked when the list still carries it, else the first (the branch-name standard). */
export function chosenDocument(
  documents: readonly StandardsDocument[],
  picked: string | null,
): StandardsDocument | null {
  return documents.find((document) => document.file === picked) ?? documents[0] ?? null;
}

/** Where the standards were read from, in a line; null when the repository carries none. */
export function standardsSourceText(answer: StandardsAnswer): string | null {
  if (answer.layout === "none" || !answer.folder) return null;
  if (answer.layout === "source") return `${answer.folder}: ${GROUPON_STANDARDS.sourceNote}`;
  return answer.version
    ? `${answer.folder} (${GROUPON_STANDARDS.pulledVersion} ${answer.version})`
    : answer.folder;
}

/** A document's line under its title: its group, how binding it is, since when. */
export function documentHint(document: StandardsDocument): string {
  return [
    document.group,
    document.status,
    document.since ? `${GROUPON_STANDARDS.since} ${document.since}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The pull button's words: pulled once already, or never. */
export function pullLabel(answer: StandardsAnswer): string {
  return answer.layout === "pulled" ? GROUPON_STANDARDS.pullAgain : GROUPON_STANDARDS.pull;
}

/** A line that starts a block of its own (heading, list item, quote, table row, fence, rule, HTML, indented code). */
const BLOCK_START =
  /^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||```|~~~|<|\s{4}|\t|(?:-{3,}|\*{3,}|_{3,}|={3,})\s*$)/;

/**
 * Paragraph lines the source wraps at a column joined into one: the renderer reads a single
 * line break as a break, made for chat, so a document wrapped at 100 columns would read in
 * ragged half lines. Fenced code, tables, headings and list items are left as written, and a
 * line ending in a hard break (two spaces, a backslash) keeps it.
 */
export function unwrapParagraphs(markdown: string): string {
  const out: string[] = [];
  let fenced = false;
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (/^(```|~~~)/.test(trimmed)) {
      fenced = !fenced;
      out.push(line);
      continue;
    }
    const previous = out[out.length - 1];
    const joinable =
      !fenced &&
      trimmed !== "" &&
      !BLOCK_START.test(line) &&
      previous !== undefined &&
      previous.trim() !== "" &&
      !/^\s*(?:#{1,6}\s|\||```|~~~|<)/.test(previous) &&
      !/(?: {2}|\\)$/.test(previous);
    if (joinable) out[out.length - 1] = `${previous.trimEnd()} ${line.trimStart()}`;
    else out.push(line);
  }
  return out.join("\n");
}

/**
 * The document as the page renders it: without its front matter (the title and summary sit
 * above it, so the metadata block is not repeated as a table), its paragraphs unwrapped.
 */
export function markdownBody(markdown: string): string {
  const match = markdown.match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/);
  const body = match ? markdown.slice(match[0].length).replace(/^\s*\n/, "") : markdown;
  return unwrapParagraphs(body);
}

/** The command a repository without standards runs to bring them in for good. */
export const ADOPT_COMMAND = "groupon standards adopt";
