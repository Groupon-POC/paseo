// Added for Groupon Desk (fork of Paseo, Apache-2.0).
/** Switch a shared cron through the real menu while every daemon call stays in a test double. */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { SchedulesTable } from "@/components/schedules/schedules-table";
import type { AggregatedSchedule } from "@/schedules/aggregated-schedules";
const f = vi.hoisted(() => ({ calls: [] as string[], error: vi.fn() }));
vi.mock("@/runtime/host-runtime", () => ({
  useHosts: () => [{ serverId: "air" }, { serverId: "mini" }],
  getHostRuntimeStore: () => ({
    getSnapshot: () => ({ connectionStatus: "online" }),
    getClient: (host: string) => ({
      invokePluginRpc: async (
        _plugin: string,
        _method: string,
        value: { scheduleId: string; active: boolean },
      ) => {
        f.calls.push(`${host}:${value.active}`);
        return { shared: true };
      },
    }),
  }),
}));
vi.mock("@/hooks/use-schedule-mutations", () => ({
  useScheduleMutations: () => ({
    pauseSchedule: vi.fn(),
    resumeSchedule: vi.fn(),
    runScheduleNow: vi.fn(),
    deleteSchedule: vi.fn(),
  }),
}));
vi.mock("@/contexts/toast-context", () => ({ useToast: () => ({ error: f.error }) }));
vi.mock("@/components/provider-icons", () => ({
  useProviderIcon: () =>
    function Icon() {
      return null;
    },
}));
vi.mock("@/components/ui/floating", async () => {
  const { forwardRef } = await import("react");
  const { View, ScrollView } = await import("react-native");
  return {
    FloatingSurface: forwardRef<
      React.ComponentRef<typeof View>,
      React.ComponentProps<typeof View> & { entering?: unknown; exiting?: unknown }
    >(function Surface({ entering: _enter, exiting: _exit, ...props }, ref) {
      return <View {...props} ref={ref} />;
    }),
    FloatingScrollView: ScrollView,
  };
});
let dispose: (() => void) | undefined;
afterEach(() => dispose?.());
it("renders one job with an active computer and chooses a different computer without running a task", async () => {
  const schedule: AggregatedSchedule = {
    id: "one",
    serverId: "air",
    serverName: "Air",
    name: "Daily report",
    prompt: "Read the daily report",
    cadence: { type: "cron", expression: "0 7 * * *" },
    status: "active",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    nextRunAt: null,
    lastRunAt: null,
    pausedAt: null,
    expiresAt: null,
    maxRuns: null,
    cron: { name: "daily", home: "/home/user" },
    target: {
      type: "new-agent",
      config: {
        provider: "claude",
        cwd: "/home/user",
        systemPrompt:
          'You are run unattended by `groupon cron` as the job "daily", on a schedule.\nRead only.',
      },
    },
  };
  const second: AggregatedSchedule = {
    ...schedule,
    id: "two",
    serverId: "mini",
    serverName: "Mini",
    status: "paused",
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const query = new QueryClient();
  dispose = () => {
    act(() => root.unmount());
    query.clear();
    host.remove();
  };
  f.calls.length = 0;
  const edit = vi.fn();
  await act(async () =>
    root.render(
      <QueryClientProvider client={query}>
        <SchedulesTable
          rows={[
            {
              schedule,
              copies: [schedule, second],
              targetLabel: "Home folder",
              provider: null,
              state: "active",
              serverName: "Air",
              singleHost: false,
            },
          ]}
          onEditSchedule={edit}
          canPlaceSharedCrons
        />
      </QueryClientProvider>,
    ),
  );
  expect(host.querySelectorAll('[data-testid="schedule-row-one"]')).toHaveLength(1);
  await page.getByLabelText("Choose computer for Daily report").click();
  await page.getByRole("menuitem", { name: "Mini", exact: true }).click();
  await vi.waitFor(() => expect(f.calls).toEqual(["air:false", "mini:false", "mini:true"]));
  expect(f.error).not.toHaveBeenCalled();
  expect(edit).not.toHaveBeenCalled();
});
