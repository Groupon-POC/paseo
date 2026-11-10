// Added for Groupon Desk (fork of Paseo, Apache-2.0): shared repository reads for sidebar and pickers, without importing UI styles.
/** Reads hub checkout identity and joins it to daemon projects; owns no rendered picker. */
import { useMemo } from "react";
import { useFetchQuery } from "@/data/query";
import type { HostProjectListItem } from "@/projects/host-project-model";
import { coreQueryRetry, coreQueryRetryDelay, coreRefetchInterval } from "./core-backoff";
import { fetchOverview, type HubCheckout, type HubRepository } from "./hub";
import type { MacPickerOption } from "./mac-picker-model";
import { repositoryEntries, type RepositoryEntry } from "./repository-picker-model";
import { useGrouponStore } from "./session";

const HUB_CHECKOUTS_REFRESH_MS = 60_000;
const NO_REPOSITORIES: HubRepository[] = [];
const NO_CHECKOUTS: HubCheckout[] = [];

/** The hub's repositories and checkouts; empty until the hub answers (or from an older hub). */
export function useHubCheckouts(options: { enabled?: boolean } = {}): {
  repositories: HubRepository[];
  checkouts: HubCheckout[];
} {
  const ready = useGrouponStore((state) => state.status === "ready");
  const query = useFetchQuery({
    queryKey: ["groupon-hub-checkouts"],
    queryFn: async () => {
      const overview = await fetchOverview();
      return { repositories: overview.repositories, checkouts: overview.checkouts ?? [] };
    },
    enabled: ready && options.enabled !== false,
    dataShape: "value",
    staleTimeMs: HUB_CHECKOUTS_REFRESH_MS,
    refetchInterval: coreRefetchInterval(HUB_CHECKOUTS_REFRESH_MS),
    retry: coreQueryRetry,
    retryDelay: coreQueryRetryDelay,
  });
  return {
    repositories: query.data?.repositories ?? NO_REPOSITORIES,
    checkouts: query.data?.checkouts ?? NO_CHECKOUTS,
  };
}

/** Every repository on the person's Macs, once each, from Paseo's projects and the hub. */
export function useRepositoryEntries(input: {
  projects: readonly HostProjectListItem[];
  macOptions: readonly MacPickerOption[];
  hostLabel: (serverId: string) => string;
  enabled?: boolean;
}): RepositoryEntry[] {
  const { repositories, checkouts } = useHubCheckouts({ enabled: input.enabled });
  const { projects, macOptions, hostLabel } = input;
  return useMemo(
    () =>
      repositoryEntries({
        projects,
        hubRepositories: repositories,
        hubCheckouts: checkouts,
        macs: macOptions,
        hostLabel,
      }),
    [checkouts, hostLabel, macOptions, projects, repositories],
  );
}
