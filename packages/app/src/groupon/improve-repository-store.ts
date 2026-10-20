// Added for Groupon Desk (fork of Paseo, Apache-2.0): which repository the Improve this repository sheet is open for.

import { create } from "zustand";
import type { ImproveRequestContext } from "./improve-repository-model";

/** The sheet's request: where it was opened from, so it opens on that repository. */
export interface ImproveRepositoryRequest {
  id: number;
  context: ImproveRequestContext;
}

interface ImproveRepositoryState {
  request: ImproveRepositoryRequest | null;
  /** Opens the sheet: from the home tile with no context, from a row or page with its project. */
  open: (context?: ImproveRequestContext) => void;
  close: () => void;
}

let nextRequestId = 1;

export const useImproveRepositoryStore = create<ImproveRepositoryState>((set) => ({
  request: null,
  open: (context) => set({ request: { id: nextRequestId++, context: context ?? {} } }),
  close: () => set({ request: null }),
}));
