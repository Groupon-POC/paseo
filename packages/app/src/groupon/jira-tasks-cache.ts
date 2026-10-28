// Added for Groupon Desk (fork of Paseo, Apache-2.0): My tasks kept on this device, shown at once while a fresh read runs.

/**
 * My tasks read Jira through the Mac each time the New workspace page opened, so the table started
 * empty. This keeps, on this device, the saved view of each Mac and the last pages read (the
 * newest few), so the card shows them at once and refreshes them behind a small spinner.
 *
 * Constraints:
 * - What is read back from storage is checked; a page in another shape is dropped
 * - At most `PAGE_LIMIT` pages are kept, the oldest read leaving first
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";
import type { JiraSavedView, JiraSearchPage } from "./desk-plugin-rpc";

const PAGE_LIMIT = 8;

const SavedViewSchema = z.object({
  jql: z.string(),
  columns: z.array(z.string()),
  updatedAt: z.string(),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A page read back from storage: its rows with keys and cells, its fields, its query. */
function isTasksPage(value: unknown): value is JiraSearchPage {
  return (
    isRecord(value) &&
    typeof value.jql === "string" &&
    Array.isArray(value.fields) &&
    Array.isArray(value.data) &&
    value.data.every((row) => isRecord(row) && typeof row.key === "string" && isRecord(row.cells))
  );
}

const PageSchema = z.custom<JiraSearchPage>(isTasksPage);

const CacheSchema = z.object({
  views: z.record(z.string(), SavedViewSchema),
  pages: z.record(z.string(), z.object({ page: PageSchema, readAt: z.number() })),
});

type CacheData = z.infer<typeof CacheSchema>;

interface JiraTasksCacheState extends CacheData {
  rememberView: (serverId: string, view: JiraSavedView) => void;
  rememberPage: (key: string, page: JiraSearchPage, readAt: number) => void;
}

/** The pages kept once `key` was read at `readAt`: the newest `PAGE_LIMIT`. */
export function keptPages(
  pages: CacheData["pages"],
  key: string,
  page: JiraSearchPage,
  readAt: number,
): CacheData["pages"] {
  const next = { ...pages, [key]: { page, readAt } };
  const newest = Object.entries(next)
    .sort((a, b) => b[1].readAt - a[1].readAt)
    .slice(0, PAGE_LIMIT);
  return Object.fromEntries(newest);
}

/** The key a page is kept under: the Mac, the query, the columns and where in the results. */
export function tasksPageKey(input: {
  serverId: string;
  jql: string;
  columns: readonly string[];
  cursor: string | null;
}): string {
  return [input.serverId, input.jql, input.columns.join(","), input.cursor ?? ""].join("\u0000");
}

export const useJiraTasksCache = create<JiraTasksCacheState>()(
  persist(
    (set) => ({
      views: {},
      pages: {},
      rememberView: (serverId, view) =>
        set((state) => ({ views: { ...state.views, [serverId]: view } })),
      rememberPage: (key, page, readAt) =>
        set((state) => ({ pages: keptPages(state.pages, key, page, readAt) })),
    }),
    {
      name: "groupon-desk-my-tasks",
      storage: createValidatedPersistStorage(AsyncStorage, CacheSchema),
      partialize: (state) => ({ views: state.views, pages: state.pages }),
      version: 1,
    },
  ),
);
