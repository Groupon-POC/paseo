// Changed for Groupon Desk (fork of Paseo, Apache-2.0): the source forms the daemon reads, as one hint under the field, the registry's page address among them.
/**
 * Every source the daemon installs from, as the hint under the Install form's field: the same
 * forms `groupon desk plugin add` takes. A registry page address is read as its `owner/slug`
 * (`parsePluginRegistryReference`).
 */
export const PLUGIN_SOURCE_HINT =
  "A registry page (https://paseo.sh/plugins/owner/slug) or owner/slug, github:owner/repo, a Git URL, npm:package, or a folder on this Mac. A plugin is trusted code: it runs unsandboxed with this Mac's rights.";

export interface PluginInstallFormState {
  source: string;
  canSubmit: boolean;
  resetKey: number;
}

export interface PluginInstallSubmission {
  source: string;
}

export interface PluginInstallFormModel {
  getState(): PluginInstallFormState;
  subscribe(listener: () => void): () => void;
  close(): void;
  setSource(value: string): void;
  getSubmission(): PluginInstallSubmission;
  reset(): void;
}

export function openPluginInstallForm(): PluginInstallFormModel {
  const listeners = new Set<() => void>();
  let state: PluginInstallFormState = {
    source: "",
    canSubmit: false,
    resetKey: 0,
  };

  const publish = (next: Pick<PluginInstallFormState, "source" | "resetKey">) => {
    state = { ...next, canSubmit: next.source.trim().length > 0 };
    for (const listener of listeners) listener();
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      listeners.clear();
    },
    setSource(source) {
      publish({ ...state, source });
    },
    getSubmission() {
      const source = state.source.trim();
      return { source };
    },
    reset() {
      publish({ source: "", resetKey: state.resetKey + 1 });
    },
  };
}
