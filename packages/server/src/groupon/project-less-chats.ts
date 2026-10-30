// Added for Groupon Desk (fork of Paseo, Apache-2.0): chats started without a project, placed by their first message.

/**
 * A chat the person starts from "New chat" names no project. Its first message decides where it
 * runs, before the workspace exists: a short structured generation reads the message against the
 * Mac's projects and answers a project (Local, or a worktree when the work will change files) or
 * none. With none, the chat gets a folder of its own under `<PASEO_HOME>/chats`, and every such
 * folder belongs to one project, "No project", which the sidebar shows as its own section. A chat
 * moved later into a project keeps its conversation: Claude Code resumes a session by id from
 * any folder, so the same session is imported into the project's workspace and the chat's own
 * agent record is dropped.
 *
 * Constraints:
 * - Classification never blocks a chat: a failure, a timeout or an unknown project answer places
 *   it in its own folder
 * - Only folders under the chats root are ever removed
 */

import { readdirSync, readFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { z } from "zod";

export const GROUPON_CHATS_RPC = {
  ensure: "groupon-desk.chats.ensure",
  place: "groupon-desk.chats.place",
  move: "groupon-desk.chats.move",
} as const;

export const CHATS_PROJECT_NAME = "No project";
const CLASSIFY_TIMEOUT_MS = 30_000;
const PROMPT_CHARS = 4_000;

export function chatsRootOf(paseoHome: string): string {
  return join(paseoHome, "chats");
}

export function isUnderChatsRoot(chatsRoot: string, path: string): boolean {
  const rel = relative(resolve(chatsRoot), resolve(path));
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !rel.startsWith(sep);
}

export interface ChatsProject {
  projectId: string;
  rootPath: string;
}

export interface ProjectCandidate {
  projectId: string;
  name: string;
  rootPath: string;
  kind: "git" | "non_git";
  /** What the repository says it is, from its README or agent instructions. */
  summary?: string;
  /** Its agent skills and commands, which name the work done there. */
  skills?: string[];
}

const SUMMARY_FILES = ["README.md", "AGENTS.md", "CLAUDE.md"];
const SKILL_FOLDERS = [".agents/skills", ".claude/skills", ".claude/commands"];
const SUMMARY_CHARS = 500;
const MAX_SKILLS = 80;

function readSummary(rootPath: string): string | undefined {
  for (const file of SUMMARY_FILES) {
    try {
      const text = readFileSync(join(rootPath, file), "utf8")
        .split("\n")
        .filter((line) => line.trim() && !line.startsWith("#") && !line.startsWith("@"))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) return text.slice(0, SUMMARY_CHARS);
    } catch {
      // A project without this file reads the next one.
    }
  }
  return undefined;
}

function readSkillNames(rootPath: string): string[] {
  const names = new Set<string>();
  for (const folder of SKILL_FOLDERS) {
    try {
      for (const entry of readdirSync(join(rootPath, folder))) {
        if (!entry.startsWith(".") && entry !== "INDEX.md") names.add(entry.replace(/\.md$/, ""));
      }
    } catch {
      // No such folder in this project.
    }
  }
  return [...names].slice(0, MAX_SKILLS);
}

/** A project's summary and skill names for the classifier; what cannot be read is left out. */
export function describeProject(candidate: ProjectCandidate): ProjectCandidate {
  const summary = readSummary(candidate.rootPath);
  const skills = readSkillNames(candidate.rootPath);
  return {
    ...candidate,
    ...(summary ? { summary } : {}),
    ...(skills.length > 0 ? { skills } : {}),
  };
}

export const ChatClassificationSchema = z.object({
  projectId: z.string().nullable(),
  isolation: z.enum(["local", "worktree"]),
  reason: z.string(),
});
export type ChatClassification = z.infer<typeof ChatClassificationSchema>;

export type ChatPlacement =
  | {
      kind: "project";
      projectId: string;
      rootPath: string;
      isolation: "local" | "worktree";
      reason: string;
    }
  | { kind: "chat"; projectId: string; path: string };

export interface PlaceChatDeps {
  chatsRoot: string;
  listProjects: () => Promise<ProjectCandidate[]>;
  classify: (prompt: string, candidates: ProjectCandidate[]) => Promise<ChatClassification>;
  ensureChatsProject: () => Promise<ChatsProject>;
  now?: () => Date;
  timeoutMs?: number;
}

export function buildClassificationPrompt(prompt: string, candidates: ProjectCandidate[]): string {
  const projects = candidates
    .map((project) =>
      [
        `- id: ${project.projectId} | name: ${project.name} | path: ${project.rootPath}`,
        project.summary ? `  about: ${project.summary}` : null,
        project.skills ? `  skills: ${project.skills.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");
  return [
    "A person starts a chat with a coding agent on their Mac. Decide where it should run.",
    "The message is often short, in any language, and does not name the project: decide by its",
    "topic, matching it against what each project is about and the work its skills name (a",
    "release train, a deploy, a service, a report).",
    "",
    "Projects on this Mac:",
    projects,
    "",
    "Answer projectId with the id of the one project whose work the message is about, or null",
    "only when it belongs to none of them (a general question, the Mac itself, another system).",
    "A project counts only when the agent will read or change its files or run its tools there;",
    "a project the message merely mentions (to leave it out, or as background) does not count.",
    "Management work with no code (logging time in Tempo or Jira, planning, status reports,",
    'messages to colleagues) goes to a project named "management" when there is one, else null.',
    'Answer isolation "worktree" when the agent will change, write or commit files in that project,',
    'and "local" when it will only read, run or analyse. With projectId null, answer "local".',
    "Give a short reason.",
    "",
    "The person's first message:",
    "<<<",
    prompt.slice(0, PROMPT_CHARS),
    ">>>",
  ].join("\n");
}

export function chatFolderName(now: Date, prompt: string): string {
  const stamp = now.toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
  return slug ? `${stamp}-${slug}` : stamp;
}

async function classifyWithin(
  prompt: string,
  candidates: ProjectCandidate[],
  deps: PlaceChatDeps,
): Promise<ChatClassification | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((done) => {
    timer = setTimeout(() => done(null), deps.timeoutMs ?? CLASSIFY_TIMEOUT_MS);
  });
  try {
    return await Promise.race([deps.classify(prompt, candidates).catch(() => null), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Where a chat whose first message is `prompt` runs; never throws for a failed classification. */
export async function placeChat(prompt: string, deps: PlaceChatDeps): Promise<ChatPlacement> {
  const candidates = (await deps.listProjects()).filter(
    (project) =>
      resolve(project.rootPath) !== resolve(deps.chatsRoot) &&
      !isUnderChatsRoot(deps.chatsRoot, project.rootPath),
  );
  const text = prompt.trim();
  const classification =
    text && candidates.length > 0 ? await classifyWithin(text, candidates, deps) : null;
  const chosen = classification?.projectId
    ? candidates.find((project) => project.projectId === classification.projectId)
    : undefined;
  if (chosen && classification) {
    return {
      kind: "project",
      projectId: chosen.projectId,
      rootPath: chosen.rootPath,
      // A worktree needs a repository.
      isolation: chosen.kind === "git" ? classification.isolation : "local",
      reason: classification.reason,
    };
  }
  const project = await deps.ensureChatsProject();
  const path = join(deps.chatsRoot, chatFolderName((deps.now ?? (() => new Date()))(), text));
  await mkdir(path, { recursive: true });
  return { kind: "chat", projectId: project.projectId, path };
}

/** Removes the chat folders among `paths`; anything outside the chats root is left alone. */
export async function removeChatFolders(chatsRoot: string, paths: string[]): Promise<void> {
  for (const path of paths) {
    if (isUnderChatsRoot(chatsRoot, path)) {
      await rm(path, { recursive: true, force: true });
    }
  }
}

export interface MoveChatAgentDeps {
  chatsRoot: string;
  getAgent: (
    agentId: string,
  ) => Promise<{ provider: string; cwd: string; sessionId: string | null } | null>;
  getWorkspaceDirectory: (workspaceId: string) => Promise<string | null>;
  dropAgent: (agentId: string) => Promise<void>;
  importSession: (input: {
    provider: string;
    providerHandleId: string;
    cwd: string;
    workspaceId: string;
  }) => Promise<string>;
}

/** Continues a project-less chat's session in `targetWorkspaceId`; answers the new agent's id. */
export async function moveChatAgent(
  input: { agentId: string; targetWorkspaceId: string },
  deps: MoveChatAgentDeps,
): Promise<{ agentId: string }> {
  const agent = await deps.getAgent(input.agentId);
  if (!agent) throw new Error(`Agent not found: ${input.agentId}`);
  if (!isUnderChatsRoot(deps.chatsRoot, agent.cwd)) {
    throw new Error("Only a chat without a project can be moved into one");
  }
  if (agent.provider !== "claude") {
    throw new Error("Only a Claude chat can be moved with its conversation");
  }
  if (!agent.sessionId) throw new Error("The chat has no session to continue yet");
  const cwd = await deps.getWorkspaceDirectory(input.targetWorkspaceId);
  if (!cwd) throw new Error(`Workspace not found: ${input.targetWorkspaceId}`);
  await deps.dropAgent(input.agentId);
  const agentId = await deps.importSession({
    provider: agent.provider,
    providerHandleId: agent.sessionId,
    cwd,
    workspaceId: input.targetWorkspaceId,
  });
  return { agentId };
}
