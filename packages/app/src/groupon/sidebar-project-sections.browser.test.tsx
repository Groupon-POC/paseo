// Added for Groupon Desk (fork of Paseo, Apache-2.0).
/** Exercise section creation, naming, ordering and assignment through the real settings controls. */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { ProjectSectionsSetting } from "./sidebar-project-sections-setting";
import { useProjectSectionsStore } from "./sidebar-project-sections-store";
const projects = [{ viewKey: "remote:github.com/a/repo", projectName: "groupon-monorepo" }];
vi.mock("@/hooks/use-sidebar-workspaces-list", () => ({
  useSidebarWorkspacesList: () => ({ projects }),
}));
vi.mock("@/contexts/toast-context", () => ({
  useToast: () => ({ show: () => () => {}, copied() {}, error() {} }),
}));
// Keep the real menu and inputs; animation is not part of this settings journey.
vi.mock("@/components/ui/floating", async () => {
  const { forwardRef } = await import("react");
  const { View, ScrollView } = await import("react-native");
  return {
    FloatingSurface: forwardRef<
      React.ComponentRef<typeof View>,
      React.ComponentProps<typeof View> & { entering?: unknown; exiting?: unknown }
    >(function TestSurface({ entering: _enter, exiting: _exit, ...props }, ref) {
      return <View {...props} ref={ref} />;
    }),
    FloatingScrollView: ScrollView,
  };
});
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
});
it("keeps section edits after reloading settings and never removes a project with its section", async () => {
  await useProjectSectionsStore.persist.rehydrate();
  useProjectSectionsStore.setState({ sections: [] });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  dispose = () => {
    act(() => root.unmount());
    host.remove();
  };
  await act(async () => root.render(<ProjectSectionsSetting />));
  await page.getByRole("textbox", { name: "New section name" }).fill("Work");
  await page.getByRole("button", { name: "Add section", exact: true }).click();
  expect(useProjectSectionsStore.getState().sections.map((section) => section.title)).toEqual([
    "Work",
  ]);
  await page.getByRole("textbox", { name: "New section name" }).fill("Personal");
  await page.getByRole("button", { name: "Add section", exact: true }).click();
  await page.getByRole("button", { name: "Move Personal up", exact: true }).click();
  expect(useProjectSectionsStore.getState().sections.map((section) => section.title)).toEqual([
    "Personal",
    "Work",
  ]);
  await page.getByLabelText("Section for groupon-monorepo").click();
  await page.getByRole("menuitem", { name: "Work", exact: true }).click();
  expect(
    useProjectSectionsStore.getState().sections.find((section) => section.title === "Work")
      ?.projectKeys,
  ).toEqual([projects[0]!.viewKey]);
  await page.getByRole("button", { name: "Remove section Work", exact: true }).click();
  expect(useProjectSectionsStore.getState().sections.map((section) => section.title)).toEqual([
    "Personal",
  ]);
  expect(host.textContent).toContain("groupon-monorepo");
  expect(host.textContent).toContain("Other projects");
  await act(async () => root.render(<ProjectSectionsSetting key="remounted" />));
  expect(host.querySelector<HTMLInputElement>('[aria-label="Section name"]')?.value).toBe(
    "Personal",
  );
});
