// Added for Groupon Desk (fork of Paseo, Apache-2.0): the project an agent asks to move its own chat into, by name or id.

/** The Groupon Desk plugin RPC the agents' door calls: `{ agentId, project, continueWith? }`, `project` null for no project. */
export const CHAT_PROJECT_RPC = "groupon-desk.chats.project";

export interface ProjectChoice {
  projectId: string;
  name: string;
  rootPath: string;
}

/** The project a name or id points at (a name in any case); throws naming the projects to pick from. */
export function projectNamed(projects: readonly ProjectChoice[], asked: string): ProjectChoice {
  const wanted = asked.trim().toLowerCase();
  const found = projects.filter(
    (project) => project.projectId === asked.trim() || project.name.toLowerCase() === wanted,
  );
  const [project] = found;
  if (found.length === 1 && project) return project;
  const names = projects.map((row) => row.name).join(", ");
  if (found.length === 0)
    throw new Error(`No project "${asked}" on this Mac; its projects: ${names}`);
  throw new Error(`More than one project is called "${asked}": give its id`);
}
