// Added for Groupon Desk (fork of Paseo, Apache-2.0).
/** Named project groups preserve project identity and order, including disconnected placements. */
import { z } from "zod";

export const ProjectSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(80),
  projectKeys: z.array(z.string()),
});
export type ProjectSection = z.infer<typeof ProjectSectionSchema>;

export function groupSidebarProjects<T extends { viewKey: string }>(
  projects: readonly T[],
  sections: readonly ProjectSection[],
): { id: string; title: string | null; projects: T[] }[] {
  if (!sections.length) return [{ id: "unassigned", title: null, projects: [...projects] }];
  const remaining = new Map(projects.map((project) => [project.viewKey, project]));
  const groups = sections.map((section) => {
    const keys = new Set(section.projectKeys);
    const members = projects.filter(
      (project) => keys.has(project.viewKey) && remaining.delete(project.viewKey),
    );
    return { id: section.id, title: section.title, projects: members };
  });
  if (remaining.size)
    groups.push({ id: "unassigned", title: "Other projects", projects: [...remaining.values()] });
  return groups;
}
