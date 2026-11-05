// Added for Groupon Desk (fork of Paseo, Apache-2.0).
/** Section changes must preserve every project and workspace, even after reconnect and restart. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { groupSidebarProjects } from "./sidebar-project-sections";
import { useProjectSectionsStore as store } from "./sidebar-project-sections-store";
const projectKeys = (items: { viewKey: string }[]) => items.map((item) => item.viewKey);
const projects = [
  { viewKey: "git:one", workspaces: ["mini:a", "studio:b"] },
  { viewKey: "git:two", workspaces: ["air:c"] },
  { viewKey: "host:path ", workspaces: [] },
];
beforeEach(async () => {
  await store.persist.rehydrate();
  store.setState({ sections: [] });
});
describe("project sections", () => {
  it("keeps the original order and identities when no sections are configured", () => {
    expect(groupSidebarProjects(projects, [])[0]?.projects).toEqual(projects);
  });
  it("groups by identity, keeps the existing order inside each section and preserves every placement", () => {
    const groups = groupSidebarProjects(projects, [
      { id: "a", title: "Work", projectKeys: ["git:two", "git:one", "offline"] },
    ]);
    expect(groups.map((group) => projectKeys(group.projects))).toEqual([
      ["git:one", "git:two"],
      ["host:path "],
    ]);
    expect(groups[0]?.projects[0]).toBe(projects[0]);
    expect(groups.flatMap((group) => group.projects)).toHaveLength(projects.length);
  });
  it("does not duplicate projects if old assignments overlap", () => {
    const groups = groupSidebarProjects(projects, [
      { id: "a", title: "A", projectKeys: ["git:one"] },
      { id: "b", title: "B", projectKeys: ["git:one"] },
    ]);
    expect(
      groups.flatMap((group) => group.projects).filter((project) => project.viewKey === "git:one"),
    ).toHaveLength(1);
  });
  it("moves, renames and deletes sections without deleting projects", () => {
    store.getState().add(" Work ");
    store.getState().add("Personal");
    const [work, personal] = store.getState().sections;
    store.getState().assign("git:one", work!.id);
    store.getState().move(personal!.id, -1);
    store.getState().rename(work!.id, "Company");
    expect(store.getState().sections.map((section) => section.title)).toEqual([
      "Personal",
      "Company",
    ]);
    store.getState().remove(work!.id);
    expect(
      groupSidebarProjects(projects, store.getState().sections).flatMap((group) => group.projects),
    ).toEqual(projects);
  });
  it("assigns one section per project, preserves path whitespace and ignores invalid destinations", () => {
    store.getState().add("A");
    store.getState().add("B");
    const [a, b] = store.getState().sections;
    store.getState().assign("host:path ", a!.id);
    store.getState().assign("host:path ", b!.id);
    store.getState().assign("host:path ", "missing");
    expect(store.getState().sections.map((section) => section.projectKeys)).toEqual([
      [],
      ["host:path "],
    ]);
    store.getState().assign("host:path ", null);
    expect(store.getState().sections.every((section) => !section.projectKeys.length)).toBe(true);
  });
  it("preserves offline assignments until the project returns", () => {
    const sections = [{ id: "a", title: "Work", projectKeys: ["git:one"] }];
    expect(groupSidebarProjects([], sections)[0]?.projects).toEqual([]);
    expect(groupSidebarProjects(projects, sections)[0]?.projects).toEqual([projects[0]]);
  });
  it("restores titles, order and project assignments from storage", async () => {
    store.getState().add("Work");
    const id = store.getState().sections[0]!.id;
    store.getState().assign("git:one", id);
    const saved = structuredClone(store.getState().sections);
    await vi.waitFor(async () => {
      const value = await store.persist
        .getOptions()
        .storage!.getItem("groupon-sidebar-project-sections");
      expect(value?.state).toEqual({ sections: saved });
    });
    const raw = await store.persist
      .getOptions()
      .storage!.getItem("groupon-sidebar-project-sections");
    store.setState({ sections: [] });
    await store.persist.getOptions().storage!.setItem("groupon-sidebar-project-sections", raw!);
    await store.persist.rehydrate();
    expect(store.getState().sections).toEqual(saved);
  });
  it("rejects blank titles and out-of-range moves", () => {
    store.getState().add(" ");
    expect(store.getState().sections).toEqual([]);
    store.getState().add("A");
    const before = store.getState().sections;
    store.getState().rename(before[0]!.id, " ");
    store.getState().move(before[0]!.id, -1);
    expect(store.getState().sections).toBe(before);
  });
});
