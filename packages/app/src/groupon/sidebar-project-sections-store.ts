// Added for Groupon Desk (fork of Paseo, Apache-2.0).
/** Local sidebar organization survives restarts; deleting a section never removes a project. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { z } from "zod";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";
import { ProjectSectionSchema, type ProjectSection } from "./sidebar-project-sections";

interface SectionState {
  sections: ProjectSection[];
  add: (title: string) => void;
  rename: (id: string, title: string) => void;
  remove: (id: string) => void;
  move: (id: string, direction: -1 | 1) => void;
  assign: (projectKey: string, sectionId: string | null) => void;
}
const withoutKey = (keys: string[], omitted: string) => keys.filter((key) => key !== omitted);
const schema = z.object({ sections: z.array(ProjectSectionSchema) });
export const useProjectSectionsStore = create<SectionState>()(
  persist(
    (set) => ({
      sections: [],
      add: (title) => {
        const normalized = title.trim().slice(0, 80);
        if (!normalized) return;
        const id =
          globalThis.crypto?.randomUUID?.() ??
          `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        set((state) => ({
          sections: [...state.sections, { id, title: normalized, projectKeys: [] }],
        }));
      },
      rename: (id, title) => {
        const normalized = title.trim().slice(0, 80);
        if (!normalized) return;
        set((state) => ({
          sections: state.sections.map((section) =>
            section.id === id ? { ...section, title: normalized } : section,
          ),
        }));
      },
      remove: (id) =>
        set((state) => ({ sections: state.sections.filter((section) => section.id !== id) })),
      move: (id, direction) =>
        set((state) => {
          const index = state.sections.findIndex((section) => section.id === id);
          const target = index + direction;
          if (index < 0 || target < 0 || target >= state.sections.length) return state;
          const sections = [...state.sections];
          [sections[index], sections[target]] = [sections[target]!, sections[index]!];
          return { sections };
        }),
      assign: (projectKey, sectionId) =>
        set((state) => {
          if (sectionId !== null && !state.sections.some((section) => section.id === sectionId))
            return state;
          return {
            sections: state.sections.map((section) => ({
              ...section,
              projectKeys:
                section.id === sectionId
                  ? [...new Set([...section.projectKeys, projectKey])]
                  : withoutKey(section.projectKeys, projectKey),
            })),
          };
        }),
    }),
    {
      name: "groupon-sidebar-project-sections",
      storage: createValidatedPersistStorage(AsyncStorage, schema),
      partialize: (state) => ({ sections: state.sections }),
      version: 1,
    },
  ),
);
